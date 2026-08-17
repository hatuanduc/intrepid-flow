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
   * No duplicate detection here — this always appends every row it's given.
   * Deciding what's worth sending (already synced? force resync?) is entirely
   * the caller's responsibility (see BankSyncService).
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
    // No dedup here — "should this row be sent at all" is entirely the caller's
    // call (normal sync only passes rows the DB hasn't marked synced yet; force
    // resync deliberately passes everything, duplicates or not). This function's
    // only job is appending at the right row. Column B (post date) is used to
    // count existing rows since it's always populated, unlike D (bankReference,
    // legitimately blank for some transaction types).
    const existingRowsResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetTab}'!B11:B`,
    });
    const existingRowCount = (existingRowsResp.data.values ?? []).length;
    const startRow = 11 + existingRowCount;

    // HSBC's export lists rows newest-first; Sheets only ever appends at the bottom,
    // so writing them as-is would zigzag the date column after each sync. Sort
    // oldest-first (postDate ascending) to read chronologically top-to-bottom.
    //
    // Same-day ties are broken by `id` (DB insertion order) ascending, NOT a plain
    // reverse of the input array — a full reverse only works if `rows` is one
    // contiguous, chronologically-ordered fetch. It isn't always: a later job can
    // backfill an earlier date range out of order (day 4 synced before day 3), or the
    // same day can be re-fetched more than once as new same-day transactions post.
    // Sorting on the real `postDate` field handles the first case regardless of fetch
    // order; `id` ascending handles the second, since a same-day row discovered by a
    // later job run gets a later id and correctly sorts after the ones already there.
    // `id` is undefined for a fresh excel.parse() result (not inserted yet) — those
    // rows fall back to their original HSBC file order via the sort's stability.
    const sortedRows = [...rows].sort((a, b) => {
      const dateDiff = a.postDate.getTime() - b.postDate.getTime();
      if (dateDiff !== 0) return dateDiff;
      if (a.id != null && b.id != null) return a.id - b.id;
      return 0;
    });

    const appendValues = sortedRows.map(r => [
      '',                                         // A — empty
      r.postDate ? formatDate(r.postDate) : '',   // B — post date
      r.narrative ?? '',                          // C — narrative
      r.bankReference ?? '',                      // D — bank reference
      r.creditAmount ?? '',                       // E — credit amount
      r.debitAmount ?? '',                        // F — debit amount
    ]);

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
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
