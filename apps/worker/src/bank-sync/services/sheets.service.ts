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
   * Duplicate detection: reads existing bank references from column D rows 11+
   * before appending, so re-runs are safe.
   */
  async sync(accountNumber: string, rows: TransactionRow[]): Promise<void> {
    if (rows.length === 0) {
      this.logger.log(`No rows to sync for ${accountNumber}`);
      return;
    }

    // ── Fetch account & GSheet config from DB ──────────────────────────────
    const account = await this.prisma.bankAccount.findUnique({
      where: { accountNumber },
    });
    if (!account) {
      this.logger.warn(`BankAccount not found for ${accountNumber} — skipping GSheets sync`);
      return;
    }

    const config = await this.prisma.bankGsheetConfig.findUnique({
      where: { countryCode: account.countryCode },
    });
    if (!config || !config.serviceKeyJson) {
      this.logger.warn(
        `No GSheet config / serviceKeyJson for country ${account.countryCode} — skipping`,
      );
      return;
    }

    const { spreadsheetId, serviceKeyJson, templateSheetName } = config;

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
      const templateSheet = templateSheetName
        ? sheetList.find(s => s.properties?.title === templateSheetName)
        : null;

      if (templateSheet && templateSheet.properties?.sheetId != null) {
        // Copy from template and rename
        const copyResp = await sheets.spreadsheets.sheets.copyTo({
          spreadsheetId,
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

    // ── Read existing bank references (D11:D) for deduplication ───────────
    const existingRefsResp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetTab}'!D11:D`,
    });
    const existingRefs = new Set<string>(
      (existingRefsResp.data.values ?? [])
        .flat()
        .map(v => String(v).trim())
        .filter(Boolean),
    );

    // ── Filter to new-only rows ────────────────────────────────────────────
    const newRows = rows.filter(
      r => r.bankReference && !existingRefs.has(r.bankReference),
    );

    if (newRows.length === 0) {
      this.logger.log(`No new rows to append for ${accountNumber} (all duplicates)`);
      return;
    }

    // ── Determine append start row (≥ 11) ─────────────────────────────────
    // Find the last occupied row in column D to know where to start appending.
    const lastOccupied =
      (existingRefsResp.data.values ?? []).length > 0
        ? 11 + (existingRefsResp.data.values ?? []).length
        : 11;
    const startRow = Math.max(lastOccupied, 11);

    const appendValues = newRows.map(r => [
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
      `Appended ${newRows.length} rows to sheet "${accountNumber}" starting at row ${startRow}`,
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
