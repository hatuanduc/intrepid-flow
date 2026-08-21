import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as ExcelJS from 'exceljs';
import { REQUIRED_COLUMNS, ALL_KNOWN_COLUMNS, COLUMN_FIELD_MAP } from '../constants';

export type TransactionRow = {
  // DB row id (insertion order). Only set when a row is reloaded from the DB
  // (retry/force-resync paths) — undefined for a fresh excel.parse() result, since
  // those rows haven't been inserted yet. sheets.service.ts uses this to break
  // same-day ties by discovery order; see the comment there for why.
  id?: number;
  postDate: Date;
  narrative: string | null;
  bankReference: string | null;
  customerReference: string | null;
  trnType: string | null;
  creditAmount: number | null;
  debitAmount: number | null;
  balance: number | null;
  dataHash: string;
  rawData: Record<string, unknown>;
};

export type HeaderValidationResult = {
  valid: boolean;
  missingRequired: string[];
  missingOptional: string[];
  extra: string[];
};

export type ParseResult = {
  rows: TransactionRow[];
  validation: HeaderValidationResult;
  actualHeaders: string[];
};

@Injectable()
export class ExcelService {
  private readonly logger = new Logger(ExcelService.name);

  /**
   * Parse an HSBCnet Excel buffer into TransactionRows.
   *
   * Steps:
   * 1. Load workbook via exceljs
   * 2. Scan rows to find the header row (contains both 'Post date' AND 'Bank reference')
   * 3. Validate headers and bail out if required columns are missing
   * 4. Extract data rows using COLUMN_FIELD_MAP
   * 5. dataHash is set to '' — BankSyncService must call ExcelService.hashRow() before saving
   */
  async parse(buffer: Buffer): Promise<ParseResult> {
    this.logger.log(`Parsing Excel buffer (${buffer.length} bytes)`);

    const wb = new ExcelJS.Workbook();
    // Cast bypasses a structural Buffer<ArrayBufferLike> mismatch caused by a duplicate,
    // older @types/node (14.x) pulled in transitively alongside our own (20.x) — same
    // runtime type, just two conflicting ambient declarations in the compilation.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buffer as any);

    const ws = wb.worksheets[0];
    if (!ws) {
      const validation = ExcelService.validateHeaders([]);
      return { rows: [], validation, actualHeaders: [] };
    }

    // ── Find header row ──────────────────────────────────────────────────────
    let headerRowNumber = -1;
    let headerIndex: Record<string, number> = {};

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (headerRowNumber !== -1) return; // already found

      // row.values is 1-indexed; slice(1) gives 0-based array
      const cellValues = (row.values as (ExcelJS.CellValue | undefined)[]).slice(1);
      const texts = cellValues.map(v => (v != null ? String(v).trim() : ''));

      const hasPostDate = texts.includes('Post date');
      const hasBankRef = texts.includes('Bank reference');

      if (hasPostDate && hasBankRef) {
        headerRowNumber = rowNumber;
        texts.forEach((text, idx) => {
          if (text) headerIndex[text] = idx;
        });
      }
    });

    if (headerRowNumber === -1) {
      this.logger.warn('Header row not found in Excel file');
      const validation = ExcelService.validateHeaders([]);
      return { rows: [], validation, actualHeaders: [] };
    }

    const actualHeaders = Object.keys(headerIndex);
    const validation = ExcelService.validateHeaders(actualHeaders);

    if (!validation.valid) {
      this.logger.error(
        `Missing required columns: ${validation.missingRequired.join(', ')}`,
      );
      return { rows: [], validation, actualHeaders };
    }

    if (validation.missingOptional.length > 0) {
      this.logger.warn(`Missing optional columns: ${validation.missingOptional.join(', ')}`);
    }
    if (validation.extra.length > 0) {
      this.logger.warn(`Unknown extra columns: ${validation.extra.join(', ')}`);
    }

    // ── Extract data rows ────────────────────────────────────────────────────
    const rows: TransactionRow[] = [];

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;

      const cellValues = (row.values as (ExcelJS.CellValue | undefined)[]).slice(1);

      // Build rawData from all header-mapped columns
      const rawData: Record<string, unknown> = {};
      for (const [colName, colIdx] of Object.entries(headerIndex)) {
        rawData[colName] = cellValues[colIdx] ?? null;
      }

      // Map to typed TransactionRow fields via COLUMN_FIELD_MAP
      const partial: Partial<TransactionRow> & { rawData: Record<string, unknown> } = {
        rawData,
        dataHash: '', // placeholder — BankSyncService overwrites before DB insert
      };

      for (const [colName, fieldName] of Object.entries(COLUMN_FIELD_MAP)) {
        const colIdx = headerIndex[colName];
        if (colIdx === undefined) continue;
        const cellVal = cellValues[colIdx];

        if (fieldName === 'postDate') {
          partial.postDate = parseDate(cellVal);
        } else if (fieldName === 'creditAmount' || fieldName === 'debitAmount' || fieldName === 'balance') {
          partial[fieldName as 'creditAmount' | 'debitAmount' | 'balance'] = parseAmount(cellVal);
        } else {
          (partial as Record<string, unknown>)[fieldName] = cellVal != null ? String(cellVal).trim() || null : null;
        }
      }

      // Skip rows without a valid postDate (likely summary/footer rows)
      if (!partial.postDate) return;

      rows.push(partial as TransactionRow);
    });

    // HSBC's export lists rows newest-first (top of file = most recent transaction).
    // Reverse here, once, right after parsing — so every downstream consumer (DB
    // insertion order/id, GSheets append, anything else that reads `rows` in array
    // order) already sees oldest-first without needing its own reordering trick.
    // In particular, DB `id` (auto-increment on insert) then rises in true
    // chronological order for a single fetch/insert batch, matching the assumption
    // sheets.service.ts's plain append relies on.
    rows.reverse();

    this.logger.log(`Parsed ${rows.length} transaction rows`);
    return { rows, validation, actualHeaders };
  }

  // ─── Static helpers ─────────────────────────────────────────────────────────

  /**
   * Validate actual Excel headers against known required/optional column lists.
   * - Missing required → valid: false (job fails)
   * - Missing optional / extra → warnings only
   */
  static validateHeaders(actualHeaders: string[]): HeaderValidationResult {
    const actual = new Set(actualHeaders);
    const known = new Set<string>(ALL_KNOWN_COLUMNS);

    const missingRequired = REQUIRED_COLUMNS.filter(c => !actual.has(c));
    const missingOptional = (ALL_KNOWN_COLUMNS as readonly string[]).filter(
      c => !REQUIRED_COLUMNS.includes(c as any) && !actual.has(c),
    );
    const extra = actualHeaders.filter(c => !known.has(c));

    return {
      valid: missingRequired.length === 0,
      missingRequired,
      missingOptional,
      extra,
    };
  }

  /**
   * Compute a SHA-256 hash for duplicate detection.
   * Incorporates accountNumber so the same bank reference across accounts stays unique.
   */
  static hashRow(accountNumber: string, row: Partial<TransactionRow>): string {
    const key = [
      accountNumber,
      row.postDate?.toISOString() ?? '',
      row.narrative ?? '',
      row.bankReference ?? '',
      row.creditAmount ?? '',
      row.debitAmount ?? '',
      row.balance ?? '',       // balance changes after each transaction — distinguishes two otherwise-identical tx
    ].join('|');
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  static hashHeaders(headers: string[]): string {
    return crypto.createHash('sha256').update(headers.join('|')).digest('hex');
  }
}

// ─── Private parse helpers ───────────────────────────────────────────────────

/**
 * Parse an exceljs cell value into a JS Date.
 * Handles: native Date objects, date serial numbers, and 'DD/MM/YYYY' strings.
 */
function parseDate(value: ExcelJS.CellValue | undefined): Date | undefined {
  if (value == null) return undefined;

  // ExcelJS may return a native Date (local midnight) — normalize to UTC midnight
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  // exceljs sometimes returns a number (Excel date serial)
  if (typeof value === 'number') {
    // Excel epoch: 1 Jan 1900 = serial 1 (with the Lotus 1-2-3 leap-year bug)
    // Use UTC to avoid server-timezone drift
    const excelEpochMs = Date.UTC(1899, 11, 30);
    const ms = excelEpochMs + value * 86_400_000;
    return new Date(ms);
  }

  const str = String(value).trim();
  if (!str) return undefined;

  // DD/MM/YYYY — always store as UTC midnight to keep date as-is
  const ddmmyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(str);
  if (ddmmyyyy) {
    return new Date(Date.UTC(
      parseInt(ddmmyyyy[3], 10),
      parseInt(ddmmyyyy[2], 10) - 1,
      parseInt(ddmmyyyy[1], 10),
    ));
  }

  // Fallback: let JS Date parse it
  const d = new Date(str);
  return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Parse a cell value to a nullable number.
 * Empty string / null / undefined → null.
 */
function parseAmount(value: ExcelJS.CellValue | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const str = String(value).trim();
  if (!str) return null;
  const n = parseFloat(str.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}
