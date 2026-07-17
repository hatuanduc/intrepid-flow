// Reconcile "filter-merge" Lambda — runs the heavy invoice parsing/merging step that used to run
// as a per-file forked child process on the EC2 host (see apps/api's old reconcile.service.ts
// history). Moved here because that step could peak at multiple GB of RAM for a single 50MB
// invoice file, which didn't scale well on the shared EC2 host running web/api/worker/db/redis.
//
// Stateless by design: the caller (apps/api) already resolved ReconcileSettings + the Master
// Customer map from Postgres and passes them in the event payload, so this function never touches
// the database (no VPC needed to reach the EC2-hosted Postgres) and never writes to it either —
// on success it uploads the merged .xlsx to S3; on failure it uploads a small JSON error marker
// next to where the output would have gone, so the caller's status-poll endpoint can tell the two
// apart without any DB write from here.
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as ExcelJS from 'exceljs';
import type { CellValue } from 'exceljs';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { readXlsxRows, type XlsxCellValue } from './xlsx-lean-reader';
import {
  buildHeaderIndex, cellToNumber, cellToString, extractBrandFromNote, normalizeHeaderKey,
  type RowType,
} from './reconcile-filter.util';

const s3 = new S3Client({});
const MONEY_FORMAT = '#,##0.00';
const HEADER_FILL = 'FFDDEBF7';

export interface ReconcileJobEvent {
  jobId: string;
  bucket: string;
  outputKey: string;
  // Already sanitized by the caller (apps/api) — carried through as S3 object metadata on the
  // result so the download endpoint can set Content-Disposition without any DB-backed job table.
  outputFileName: string;
  inputFiles: { key: string; originalName: string }[];
  opts: {
    headerRow: number;
    salesColumn: string;
    taxColumn: string;
    noteColumn: string;
    customerColumn: string;
  };
  masterMap: [string, string][];
}

interface Totals {
  retailSales: number;
  retailTax: number;
  serviceSales: number;
  serviceTax: number;
}

interface AggregateEntry {
  customerName: string;
  typeLabel: RowType;
  sales: number;
  tax: number;
}

interface FileParseResult {
  detailHeader: CellValue[];
  salesColIdx: number;
  taxColIdx: number;
  totals: Totals;
  aggregates: Map<string, AggregateEntry>;
}

// Parses one invoice file, invoking onDetailRow for every SERVICE/OTHER row (blank-Note and
// RETAIL rows never reach the detail sheet — legacy behavior, matches the old worker exactly).
// Reads the whole file top to bottom every call — used twice per file (see run() below) so the
// caller can get final totals before it has to commit a single detail row.
async function parseInvoiceFile(
  filePath: string,
  originalName: string,
  opts: ReconcileJobEvent['opts'],
  dictCustomer: Map<string, string>,
  onDetailRow: ((values: CellValue[]) => void) | null,
): Promise<FileParseResult> {
  const totals: Totals = { retailSales: 0, retailTax: 0, serviceSales: 0, serviceTax: 0 };
  const aggregates = new Map<string, AggregateEntry>();
  let detailHeader: CellValue[] = [];
  let salesColIdx = 0;
  let taxColIdx = 0;

  let fileLastCol = 0;
  let salesIdx = 0;
  let taxIdx = 0;
  let noteIdx = 0;
  let customerIdx = 0;

  await readXlsxRows(filePath, (rowNum, values: XlsxCellValue[]) => {
    if (rowNum === opts.headerRow) {
      fileLastCol = values.length - 1;
      const headerIdx = buildHeaderIndex(values);

      const sIdx = headerIdx.get(normalizeHeaderKey(opts.salesColumn));
      const tIdx = headerIdx.get(normalizeHeaderKey(opts.taxColumn));
      const nIdx = headerIdx.get(normalizeHeaderKey(opts.noteColumn));
      const cIdx = headerIdx.get(normalizeHeaderKey(opts.customerColumn));

      if (sIdx === undefined) throw new Error(`Không tìm thấy cột doanh số "${opts.salesColumn}" trong file "${originalName}" (dòng tiêu đề: ${opts.headerRow}).`);
      if (tIdx === undefined) throw new Error(`Không tìm thấy cột thuế "${opts.taxColumn}" trong file "${originalName}" (dòng tiêu đề: ${opts.headerRow}).`);
      if (nIdx === undefined) throw new Error(`Không tìm thấy cột ghi chú "${opts.noteColumn}" trong file "${originalName}" (dòng tiêu đề: ${opts.headerRow}).`);

      salesIdx = sIdx;
      taxIdx = tIdx;
      noteIdx = nIdx;
      customerIdx = cIdx ?? 0;
      salesColIdx = salesIdx;
      taxColIdx = taxIdx;
      detailHeader = values.slice(0, fileLastCol + 1);
      return;
    }

    if (rowNum < opts.headerRow || fileLastCol === 0) return;

    const noteVal = cellToString(values[noteIdx]).trim();
    if (noteVal === '') return; // blank Note -> skip entirely (no detail row, no aggregation)

    const salesVal = cellToNumber(values[salesIdx]);
    const taxVal = cellToNumber(values[taxIdx]);

    let customerName: string;
    let type: RowType;

    if (noteVal.startsWith('Retail_')) {
      type = 'RETAIL';
      const brand = extractBrandFromNote(noteVal, rowNum);
      customerName = dictCustomer.get(brand) ?? brand;
    } else {
      const rawCustomer = customerIdx > 0 ? cellToString(values[customerIdx]).trim() : '';
      customerName = rawCustomer ? rawCustomer.toUpperCase() : `UNDEFINED-${rowNum}`;
      type = noteVal.startsWith('Service_') ? 'SERVICE' : 'OTHER';
    }

    const key = `${customerName}|${type}`;
    const entry = aggregates.get(key) ?? { customerName, typeLabel: type, sales: 0, tax: 0 };
    entry.sales += salesVal;
    entry.tax += taxVal;
    aggregates.set(key, entry);

    if (type === 'RETAIL') {
      totals.retailSales += salesVal;
      totals.retailTax += taxVal;
      // Retail rows are totaled but never copied to the detail sheet (legacy behavior).
    } else {
      if (type === 'SERVICE') {
        totals.serviceSales += salesVal;
        totals.serviceTax += taxVal;
      }
      onDetailRow?.(values.slice(0, fileLastCol + 1));
    }
  });

  return { detailHeader, salesColIdx, taxColIdx, totals, aggregates };
}

async function downloadToTmp(bucket: string, key: string, destPath: string): Promise<void> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = res.Body as NodeJS.ReadableStream;
  await new Promise<void>((resolve, reject) => {
    const dest = fs.createWriteStream(destPath);
    body.pipe(dest);
    body.on('error', reject);
    dest.on('error', reject);
    dest.on('finish', resolve);
  });
}

async function uploadFromTmp(
  bucket: string,
  key: string,
  srcPath: string,
  contentType: string,
  metadata?: Record<string, string>,
): Promise<void> {
  const body = fs.readFileSync(srcPath);
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType, Metadata: metadata }));
}

async function runJob(event: ReconcileJobEvent): Promise<void> {
  const dictCustomer = new Map(event.masterMap);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `reconcile-${event.jobId}-`));
  const localInputs: { path: string; originalName: string }[] = [];

  try {
    for (let i = 0; i < event.inputFiles.length; i++) {
      const f = event.inputFiles[i];
      const localPath = path.join(tmpDir, `in-${i}${path.extname(f.originalName) || '.xlsx'}`);
      await downloadToTmp(event.bucket, f.key, localPath);
      localInputs.push({ path: localPath, originalName: f.originalName });
    }

    const totals: Totals = { retailSales: 0, retailTax: 0, serviceSales: 0, serviceTax: 0 };
    const aggregates = new Map<string, AggregateEntry>();
    let detailHeader: CellValue[] = [];
    let salesColOut = 0;
    let taxColOut = 0;

    // Pass 1: totals + aggregates only (bounded by unique customer×type combos, not row count).
    // Detail rows are not collected here — the Detail sheet's "TOTAL" rows are written before its
    // data rows (see below), so totals must be final before any detail row can be streamed out.
    for (const file of localInputs) {
      const result = await parseInvoiceFile(file.path, file.originalName, event.opts, dictCustomer, null);

      if (detailHeader.length === 0) {
        detailHeader = result.detailHeader;
        salesColOut = result.salesColIdx;
        taxColOut = result.taxColIdx;
      }

      totals.retailSales += result.totals.retailSales;
      totals.retailTax += result.totals.retailTax;
      totals.serviceSales += result.totals.serviceSales;
      totals.serviceTax += result.totals.serviceTax;

      for (const entry of result.aggregates.values()) {
        const key = `${entry.customerName}|${entry.typeLabel}`;
        const existing = aggregates.get(key) ?? { customerName: entry.customerName, typeLabel: entry.typeLabel, sales: 0, tax: 0 };
        existing.sales += entry.sales;
        existing.tax += entry.tax;
        aggregates.set(key, existing);
      }
    }

    const outLocalPath = path.join(tmpDir, 'output.xlsx');
    const { workbook, detail } = beginOutputWorkbook(outLocalPath, {
      detailHeader,
      salesColOut,
      taxColOut,
      totals,
      aggregates: [...aggregates.values()],
      opts: event.opts,
    });

    // Pass 2: re-read each file and stream its detail rows straight into the Detail sheet, one
    // file at a time — each row is written and discarded before the next is read, so peak memory
    // here is bounded by a single file's rows, not the whole batch.
    let outRowNum = 5;
    for (const file of localInputs) {
      await parseInvoiceFile(file.path, file.originalName, event.opts, dictCustomer, values => {
        const row = detail.getRow(outRowNum);
        values.forEach((v, idx) => {
          if (idx > 0) row.getCell(idx).value = v;
        });
        if (salesColOut > 0) row.getCell(salesColOut).numFmt = MONEY_FORMAT;
        if (taxColOut > 0) row.getCell(taxColOut).numFmt = MONEY_FORMAT;
        row.commit();
        outRowNum++;
      });
    }

    detail.commit();
    await workbook.commit();

    await uploadFromTmp(
      event.bucket,
      event.outputKey,
      outLocalPath,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // S3 metadata values ride along as HTTP headers — encode to keep Vietnamese diacritics
      // (Đ, ư, ...) intact; the download endpoint decodes this back before setting
      // Content-Disposition (see reconcile.service.ts's downloadResult()).
      { 'output-filename': encodeURIComponent(event.outputFileName) },
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Creates the output workbook and writes the Summary sheet + the Detail sheet's fixed header rows
// (TOTAL Retail/Service + column header) — everything that needs final totals/aggregates but
// comes *before* the Detail sheet's data rows. Returns the still-open workbook + Detail worksheet
// so the caller can stream data rows into it (pass 2 above) without holding them all in memory.
function beginOutputWorkbook(
  outPath: string,
  data: {
    detailHeader: CellValue[];
    salesColOut: number;
    taxColOut: number;
    totals: Totals;
    aggregates: AggregateEntry[];
    opts: ReconcileJobEvent['opts'];
  },
): { workbook: ExcelJS.stream.xlsx.WorkbookWriter; detail: ExcelJS.Worksheet } {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: outPath, useStyles: true, useSharedStrings: true });

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [{ width: 40 }, { width: 20 }, { width: 20 }, { width: 20 }];

  const totalRetailRow = summary.addRow(['TOTAL Retail:', data.totals.retailSales, data.totals.retailTax]);
  totalRetailRow.font = { bold: true };
  totalRetailRow.getCell(2).numFmt = MONEY_FORMAT;
  totalRetailRow.getCell(3).numFmt = MONEY_FORMAT;
  totalRetailRow.commit();

  const totalServiceRow = summary.addRow(['TOTAL Service:', data.totals.serviceSales, data.totals.serviceTax]);
  totalServiceRow.font = { bold: true };
  totalServiceRow.getCell(2).numFmt = MONEY_FORMAT;
  totalServiceRow.getCell(3).numFmt = MONEY_FORMAT;
  totalServiceRow.commit();

  summary.addRow([]).commit(); // spacer row (row 3)

  const summaryHeaderRow = summary.addRow([
    data.opts.customerColumn,
    data.opts.salesColumn,
    data.opts.taxColumn,
    data.opts.noteColumn,
  ]);
  summaryHeaderRow.font = { bold: true };
  summaryHeaderRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });
  summaryHeaderRow.commit();

  for (const entry of data.aggregates) {
    const row = summary.addRow([entry.customerName, entry.sales, entry.tax, entry.typeLabel]);
    row.getCell(2).numFmt = MONEY_FORMAT;
    row.getCell(3).numFmt = MONEY_FORMAT;
    row.commit();
  }
  summary.commit();

  const detail = workbook.addWorksheet('Service_Invoices_Detail');
  const detailColCount = Math.max(data.detailHeader.length - 1, 1);
  detail.columns = Array.from({ length: detailColCount }, () => ({ width: 20 }));

  const labelEndCol = Math.max(data.salesColOut - 1, 1);
  detail.mergeCells(1, 1, 1, labelEndCol);
  detail.mergeCells(2, 1, 2, labelEndCol);

  const totalRetailDetailRow = detail.getRow(1);
  totalRetailDetailRow.getCell(1).value = 'TOTAL Retail:';
  totalRetailDetailRow.getCell(1).font = { bold: true };
  if (data.salesColOut > 0) {
    totalRetailDetailRow.getCell(data.salesColOut).value = data.totals.retailSales;
    totalRetailDetailRow.getCell(data.salesColOut).numFmt = MONEY_FORMAT;
  }
  if (data.taxColOut > 0) {
    totalRetailDetailRow.getCell(data.taxColOut).value = data.totals.retailTax;
    totalRetailDetailRow.getCell(data.taxColOut).numFmt = MONEY_FORMAT;
  }
  totalRetailDetailRow.commit();

  const totalServiceDetailRow = detail.getRow(2);
  totalServiceDetailRow.getCell(1).value = 'TOTAL Service:';
  totalServiceDetailRow.getCell(1).font = { bold: true };
  if (data.salesColOut > 0) {
    totalServiceDetailRow.getCell(data.salesColOut).value = data.totals.serviceSales;
    totalServiceDetailRow.getCell(data.salesColOut).numFmt = MONEY_FORMAT;
  }
  if (data.taxColOut > 0) {
    totalServiceDetailRow.getCell(data.taxColOut).value = data.totals.serviceTax;
    totalServiceDetailRow.getCell(data.taxColOut).numFmt = MONEY_FORMAT;
  }
  totalServiceDetailRow.commit();

  detail.getRow(3).commit(); // blank spacer row

  const detailHeaderRow = detail.getRow(4);
  data.detailHeader.forEach((v, idx) => {
    if (idx > 0) detailHeaderRow.getCell(idx).value = v;
  });
  detailHeaderRow.font = { bold: true };
  detailHeaderRow.commit();

  return { workbook, detail };
}

export async function handler(event: ReconcileJobEvent): Promise<void> {
  try {
    await runJob(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[reconcile-lambda] job ${event.jobId} failed:`, err);
    await s3.send(new PutObjectCommand({
      Bucket: event.bucket,
      Key: `${event.outputKey}.error.json`,
      Body: JSON.stringify({ message }),
      ContentType: 'application/json',
    }));
  }
}
