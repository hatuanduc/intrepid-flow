import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import type { TransactionRow } from './excel.service';

@Injectable()
export class SheetsService {
  private readonly logger = new Logger(SheetsService.name);
  private readonly prisma = new PrismaClient();

  /**
   * Sync transactions to Google Sheets for a given account.
   *
   * Sheet layout (per account — sheet name = accountNumber):
   *   C6: account name
   *   C7: account number
   *   C8: bank name
   *   Row 11+: B=postDate(DD/MM/YYYY), C=narrative, D=bankReference,
   *             E=creditAmount, F=debitAmount
   *
   * Plain append-only — this always appends every row it's given, at the current end
   * of the sheet. No dedup, no re-reading/re-ordering what's already there. Deciding
   * what's worth sending (already synced? force resync?) is entirely the caller's call.
   *
   * Correctness now depends on rows already arriving in true chronological (oldest→
   * newest) order — HSBC's own export lists newest-first, so excel.service.ts reverses
   * it before insertion, meaning DB `id` ascending already equals bank chronological
   * order for the common case (one job inserting a day's rows in one go). This does NOT
   * fully hold when the same calendar day is fetched across two separate job runs (a
   * row discovered by a later job can still belong earlier in true order than rows a
   * prior job already appended) — accepted as a rare, low-impact edge case in exchange
   * for a much simpler and safer sync (no clear/rewrite, no risk of a blank sheet on a
   * failure mid-write, no row-position churn for anything referencing this sheet by
   * row number). See rebuildAccountOrder() below for a manual, one-off repair tool that
   * uses the (slower, DB-read-heavy) balance-chain reconstruction to fix a specific
   * account whose sheet ended up out of order because of that edge case.
   */
  async sync(accountNumber: string, rows: TransactionRow[]): Promise<{ skipped: boolean; reason?: string; accountName?: string; rowsSynced?: number }> {
    if (rows.length === 0) {
      this.logger.log(`No rows to sync for ${accountNumber}`);
      return { skipped: true, reason: 'no_rows' };
    }

    // ── Fetch account & GSheet config from DB ──────────────────────────────
    const account = await this.prisma.bankAccount.findUnique({
      where: { accountNumber },
    });
    if (!account) {
      this.logger.warn(`BankAccount not found for ${accountNumber} — skipping GSheets sync`);
      return { skipped: true, reason: 'account_not_found' };
    }

    const config = await this.prisma.bankGsheetConfig.findUnique({
      where: { accountCode: account.accountCode },
    });
    if (!config || !config.isActive || !config.spreadsheetId) {
      this.logger.warn(
        `No active GSheet config for ${account.accountName} (${account.accountCode}) — skipping`,
      );
      return { skipped: true, reason: 'no_gsheet_config', accountName: account.accountName };
    }

    // Template comes from BankJobSettings; service key is the app-wide one in SystemSettings
    const globalSettings = await this.prisma.bankJobSettings.findUnique({ where: { id: 'default' } });
    const systemSettings = await this.prisma.systemSettings.findUnique({ where: { id: 'default' } });
    const serviceKeyJson = systemSettings?.googleServiceKeyJson ?? null;
    const templateSheetName = globalSettings?.googleTemplateSheet ?? null;
    const templateSpreadsheetId = globalSettings?.googleTemplateSpreadsheetId ?? null;

    if (!serviceKeyJson) {
      this.logger.warn(`No Google service account key configured — skipping GSheets sync`);
      return { skipped: true, reason: 'no_service_key' };
    }

    const { spreadsheetId } = config;

    // ── Auth ───────────────────────────────────────────────────────────────
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(serviceKeyJson) as Record<string, unknown>,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // ── Ensure sheet for this account exists ───────────────────────────────
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetList = spreadsheet.data.sheets ?? [];
    const sheetNames = sheetList.map(s => s.properties?.title ?? '');

    let sheetId: number | null = null;
    const existingSheet = sheetList.find(s => s.properties?.title === accountNumber);

    if (existingSheet) {
      sheetId = existingSheet.properties?.sheetId ?? null;
      this.logger.log(`Sheet "${accountNumber}" already exists`);
    } else {
      // Template may live in a separate master spreadsheet or within this one
      const templateSourceId = templateSpreadsheetId || spreadsheetId;
      let templateSheetIdToClone: number | null = null;

      if (templateSheetName) {
        const templateSource = templateSourceId === spreadsheetId
          ? spreadsheet
          : await sheets.spreadsheets.get({ spreadsheetId: templateSourceId });
        const tSheet = (templateSource.data.sheets ?? [])
          .find(s => s.properties?.title === templateSheetName);
        if (tSheet?.properties?.sheetId != null) {
          templateSheetIdToClone = tSheet.properties.sheetId;
        }
      }

      const templateSheet = templateSheetIdToClone != null
        ? { properties: { sheetId: templateSheetIdToClone } }
        : null;

      if (templateSheet && templateSheet.properties?.sheetId != null) {
        // Copy from template (may be in a different spreadsheet) and rename
        const copyResp = await sheets.spreadsheets.sheets.copyTo({
          spreadsheetId: templateSpreadsheetId || spreadsheetId,
          sheetId: templateSheet.properties.sheetId,
          requestBody: { destinationSpreadsheetId: spreadsheetId },
        });
        const newSheetId = copyResp.data.sheetId!;

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                updateSheetProperties: {
                  properties: { sheetId: newSheetId, title: accountNumber },
                  fields: 'title',
                },
              },
            ],
          },
        });
        sheetId = newSheetId;
        this.logger.log(`Sheet "${accountNumber}" created from template "${templateSheetName}"`);
      } else {
        // Create blank sheet
        const addResp = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              { addSheet: { properties: { title: accountNumber } } },
            ],
          },
        });
        const addedSheet = addResp.data.replies?.[0]?.addSheet;
        sheetId = addedSheet?.properties?.sheetId ?? null;
        this.logger.log(`Blank sheet "${accountNumber}" created`);
      }
    }

    const sheetTab = accountNumber; // use sheet name in A1 notation

    // ── Write account info header block ────────────────────────────────────
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: `'${sheetTab}'!C6`, values: [[account.accountName]] },
          { range: `'${sheetTab}'!C7`, values: [[accountNumber]] },
          { range: `'${sheetTab}'!C8`, values: [[account.bankName]] },
        ],
      },
    });

    // ── Find append position ────────────────────────────────────────────────
    // Column B (post date) is used to count existing rows since it's always
    // populated, unlike D (bankReference, legitimately blank for some transaction
    // types).
    const existingRowsResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetTab}'!B11:B`,
    });
    const existingRowCount = (existingRowsResp.data.values ?? []).length;
    const startRow = 11 + existingRowCount;

    // `rows` should already arrive oldest-first (see excel.service.ts, which reverses
    // HSBC's newest-first export before insertion) — this sort is just a safety net,
    // stable for equal postDates so it never fights that upstream order.
    const sortedRows = [...rows].sort((a, b) => a.postDate.getTime() - b.postDate.getTime());

    const appendValues = sortedRows.map(r => [
      '',                                         // A — empty
      r.postDate ? formatDate(r.postDate) : '',   // B — post date
      r.narrative ?? '',                          // C — narrative
      r.bankReference ?? '',                      // D — bank reference
      r.creditAmount ?? '',                       // E — credit amount
      r.debitAmount ?? '',                        // F — debit amount
    ]);

    // ── Grow the sheet's grid if the append would run past it ─────────────
    // A tab's row/column count is a fixed grid size, not the size of its data —
    // it does NOT auto-expand on write. Check the real grid size for this specific
    // sheetId right before writing and pad it out if needed.
    const requiredRowCount = startRow + appendValues.length - 1;
    if (sheetId != null) {
      // Filter by sheetId (a stable numeric id), not by name via `ranges` — an A1-notation
      // range built from the account number isn't guaranteed to resolve to this exact tab,
      // and silently falling back to some OTHER sheet's rowCount would make this whole
      // check a no-op (looks fine, expansion never actually happens).
      const sheetMeta = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties(sheetId,gridProperties)',
      });
      const targetSheet = sheetMeta.data.sheets?.find(sh => sh.properties?.sheetId === sheetId);
      const currentRowCount = targetSheet?.properties?.gridProperties?.rowCount ?? 0;
      if (requiredRowCount > currentRowCount) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                appendDimension: {
                  sheetId,
                  dimension: 'ROWS',
                  length: requiredRowCount - currentRowCount,
                },
              },
            ],
          },
        });
        this.logger.log(
          `Expanded sheet "${accountNumber}" grid from ${currentRowCount} to ${requiredRowCount} rows`,
        );
      }
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetTab}'!A${startRow}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: appendValues },
    });

    this.logger.log(
      `Appended ${sortedRows.length} rows to sheet "${accountNumber}" starting at row ${startRow}`,
    );
    return { skipped: false, rowsSynced: sortedRows.length };
  }

  /**
   * Manual, one-off repair tool — NOT called by the regular sync path. Rewrites an
   * account's entire sheet block from scratch, in true bank order reconstructed via
   * the balance chain (see orderByBalanceChain below), for when the append-only sync()
   * above has already produced a wrong order (same day fetched across ≥2 separate job
   * runs — see sync()'s docstring). Deliberately not automatic: a full clear+rewrite on
   * every sync would risk leaving the sheet blank on a failure mid-write, shifts row
   * positions for anything referencing this sheet by row number, and costs an extra
   * API call every single sync — acceptable for a rare, manually-triggered repair, not
   * for routine operation.
   */
  async rebuildAccountOrder(accountNumber: string): Promise<{ ok: boolean; reason?: string; rowsWritten?: number; fallbackDays?: string[] }> {
    const account = await this.prisma.bankAccount.findUnique({ where: { accountNumber } });
    if (!account) return { ok: false, reason: 'account_not_found' };

    const config = await this.prisma.bankGsheetConfig.findUnique({ where: { accountCode: account.accountCode } });
    if (!config || !config.isActive || !config.spreadsheetId) return { ok: false, reason: 'no_gsheet_config' };

    const systemSettings = await this.prisma.systemSettings.findUnique({ where: { id: 'default' } });
    const serviceKeyJson = systemSettings?.googleServiceKeyJson ?? null;
    if (!serviceKeyJson) return { ok: false, reason: 'no_service_key' };

    const { spreadsheetId } = config;
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(serviceKeyJson) as Record<string, unknown>,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheet = (spreadsheet.data.sheets ?? []).find(s => s.properties?.title === accountNumber);
    const sheetId = existingSheet?.properties?.sheetId ?? null;
    if (sheetId == null) return { ok: false, reason: 'sheet_not_found' };

    const allTxns = await this.prisma.bankTransaction.findMany({
      where: { bankAccountId: account.id },
      select: {
        id: true, postDate: true, narrative: true, bankReference: true,
        creditAmount: true, debitAmount: true, balance: true,
      },
    });
    const allRows: TransactionRow[] = allTxns.map(t => ({
      id: t.id,
      postDate: t.postDate,
      narrative: t.narrative,
      bankReference: t.bankReference,
      customerReference: null,
      trnType: null,
      creditAmount: t.creditAmount != null ? Number(t.creditAmount) : null,
      debitAmount: t.debitAmount != null ? Number(t.debitAmount) : null,
      balance: t.balance != null ? Number(t.balance) : null,
      dataHash: '',
      rawData: {},
    }));

    const { ordered, fallbackDays } = orderByBalanceChain(allRows);
    const appendValues = ordered.map(r => [
      '',
      r.postDate ? formatDate(r.postDate) : '',
      r.narrative ?? '',
      r.bankReference ?? '',
      r.creditAmount ?? '',
      r.debitAmount ?? '',
    ]);

    const sheetTab = accountNumber;
    const requiredRowCount = 11 + appendValues.length - 1;
    const sheetMeta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties(sheetId,gridProperties)',
    });
    const currentRowCount = sheetMeta.data.sheets
      ?.find(sh => sh.properties?.sheetId === sheetId)?.properties?.gridProperties?.rowCount ?? 0;
    if (requiredRowCount > currentRowCount) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ appendDimension: { sheetId, dimension: 'ROWS', length: requiredRowCount - currentRowCount } }],
        },
      });
    }

    await sheets.spreadsheets.values.clear({ spreadsheetId, range: `'${sheetTab}'!A11:F` });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetTab}'!A11`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: appendValues },
    });

    this.logger.log(
      `Rebuilt sheet "${accountNumber}" — ${ordered.length} rows in balance-chain order`
        + (fallbackDays.length > 0 ? ` (fallback used for: ${fallbackDays.join(', ')})` : ''),
    );
    return { ok: true, rowsWritten: ordered.length, fallbackDays };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Reorder transactions into true bank chronological order using the account's own
 * reported running balance — immune to `id`/insertion-order assumptions, which break
 * the moment the same calendar day gets fetched across more than one job run (see
 * sync()'s docstring above for why that matters).
 *
 * Grouped by calendar day first: balance is a single global running total for the
 * whole account, but confining the chain-matching to one day at a time makes a
 * coincidental balance collision (two unrelated rows landing on the exact same value)
 * astronomically unlikely, and keeps one broken/ambiguous day from affecting any other.
 */
function orderByBalanceChain(rows: TransactionRow[]): { ordered: TransactionRow[]; fallbackDays: string[] } {
  const byDay = new Map<string, TransactionRow[]>();
  for (const r of rows) {
    const key = r.postDate.toISOString().slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(r);
  }

  const fallbackDays: string[] = [];
  const ordered: TransactionRow[] = [];
  for (const day of Array.from(byDay.keys()).sort()) {
    const group = byDay.get(day)!;
    const chained = orderDayByBalanceChain(group);
    if (chained) {
      ordered.push(...chained);
    } else {
      fallbackDays.push(day);
      ordered.push(...fallbackSort(group));
    }
  }
  return { ordered, fallbackDays };
}

/** Cents-level rounding to guard against float drift when comparing amounts. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Try to reconstruct one calendar day's true order via the balance chain. Returns
 * null (caller falls back to date/id order) whenever the chain can't be trusted —
 * missing balance data, a genuine collision, or a break partway through — rather
 * than ever guessing and silently producing a wrong order.
 */
function orderDayByBalanceChain(rows: TransactionRow[]): TransactionRow[] | null {
  if (rows.length <= 1) return rows;
  if (rows.some(r => r.balance == null)) return null; // can't chain-link an unknown balance

  // debitAmount is stored as an already-negative number in the DB (confirmed against
  // real data — e.g. -16500, not 16500), matching how getMetrics() computes netFlow
  // as `totalCredit + totalDebit` elsewhere. So the net effect on balance is a plain
  // sum, NOT credit minus debit — that subtraction would double-count every debit.
  const net = (r: TransactionRow) => (r.creditAmount ?? 0) + (r.debitAmount ?? 0);
  const balanceBefore = (r: TransactionRow) => round2(r.balance! - net(r));

  const byEndingBalance = new Map<number, TransactionRow>();
  for (const r of rows) {
    const key = round2(r.balance!);
    if (byEndingBalance.has(key)) return null; // two rows end at the same balance — ambiguous
    byEndingBalance.set(key, r);
  }

  const byBalanceBefore = new Map<number, TransactionRow>();
  for (const r of rows) {
    const key = balanceBefore(r);
    if (byBalanceBefore.has(key)) return null; // two rows share a predecessor point — ambiguous
    byBalanceBefore.set(key, r);
  }

  let starts = rows.filter(r => !byEndingBalance.has(balanceBefore(r)));

  // Zero starts means every row's balanceBefore matches some other row's ending
  // balance within this same set — a credit/debit pair (or bigger loop) that nets to
  // exactly zero over the day, so the balance revisits a value it already passed
  // through. The math genuinely can't tell which direction is real (e.g. debit 25,000
  // then credit 25,000 checks out identically to credit-then-debit) — confirmed by
  // testing on real data, not a hypothetical. Break the tie with a business
  // assumption instead of refusing outright: money coming IN tends to precede money
  // going OUT (an internal transfer funding a specific payment typically posts before
  // the payment it funds). This is a guess, not a verified fact — only reached for
  // ONE candidate credit-only row; any more and it's still genuinely ambiguous.
  if (starts.length === 0) {
    const creditOnly = rows.filter(r => (r.creditAmount ?? 0) > 0 && (r.debitAmount ?? 0) === 0);
    if (creditOnly.length !== 1) return null;
    starts = creditOnly;
  }
  if (starts.length !== 1) return null; // >1 = more than one disconnected chain

  const ordered: TransactionRow[] = [starts[0]];
  const used = new Set<TransactionRow>(ordered);
  let current = starts[0];
  while (ordered.length < rows.length) {
    const next = byBalanceBefore.get(round2(current.balance!));
    if (!next || used.has(next)) return null; // broken link or cycle
    ordered.push(next);
    used.add(next);
    current = next;
  }
  return ordered;
}

function fallbackSort(rows: TransactionRow[]): TransactionRow[] {
  return [...rows].sort((a, b) => {
    const dateDiff = a.postDate.getTime() - b.postDate.getTime();
    if (dateDiff !== 0) return dateDiff;
    // id ASC — excel.service.ts reverses HSBC's newest-first export before insertion,
    // so ascending id already matches bank chronological order for the common case.
    if (a.id != null && b.id != null) return a.id - b.id;
    return 0;
  });
}

function formatDate(d: Date): string {
  // postDate is built via Date.UTC(...) upstream (excel.service.ts parseDate) —
  // must read it back with the UTC getters, or a non-UTC server timezone shifts
  // the day by one.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  // ISO 8601 (YYYY-MM-DD): Sheets parses this identically regardless of
  // spreadsheet locale. DD/MM/YYYY is ambiguous — a US-locale (MM/DD/YYYY)
  // spreadsheet silently reads day/month swapped, corrupting the date. The
  // account sheet's own column format still renders the result as dd-MMM-yy.
  return `${yyyy}-${mm}-${dd}`;
}
