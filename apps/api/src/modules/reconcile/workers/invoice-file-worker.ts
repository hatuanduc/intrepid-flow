// Standalone script — not part of the Nest DI graph. Spawned via child_process.fork() from
// reconcile.service.ts, one process per invoice file. Uses the lean SAX-based reader
// (xlsx-lean-reader.ts) instead of ExcelJS entirely: ExcelJS's streaming WorkbookReader was found
// to be flaky even as a single isolated read in a fresh process (~1-in-4 failure rate in testing,
// "Cannot read properties of undefined (reading 'sheets')"), and its plain (non-streaming) loader
// materializes every cell as an individually-allocated string object — on real invoice exports
// that use inline strings instead of the shared-strings table, that peaked at 2GB+ of heap for a
// ~27MB file. The lean reader bypasses ExcelJS's object model, so peak memory is bounded by the
// filtered *output* this file retains, not by how the input encodes its strings. Memory is
// further bounded by running each file in its own process with a capped heap (see
// reconcile.service.ts's runInvoiceFileWorker()) — a runaway file fails just that one file
// cleanly instead of risking a server-wide OOM.
import { readXlsxRows, type XlsxCellValue } from './xlsx-lean-reader';
import {
  buildHeaderIndex, cellToNumber, cellToString, extractBrandFromNote, normalizeHeaderKey, serializeCellValue,
  type RowType, type SerializedCellValue,
} from '../reconcile-filter.util';

interface InvoiceWorkerInput {
  filePath: string;
  originalName: string;
  headerRow: number;
  salesColumn: string;
  taxColumn: string;
  noteColumn: string;
  customerColumn: string;
  masterMap: [string, string][];
}

interface AggregateEntry {
  customerName: string;
  typeLabel: RowType;
  sales: number;
  tax: number;
}

interface InvoiceWorkerResult {
  detailHeader: SerializedCellValue[];
  salesColIdx: number;
  taxColIdx: number;
  totals: { retailSales: number; retailTax: number; serviceSales: number; serviceTax: number };
  aggregates: AggregateEntry[];
  detailRows: SerializedCellValue[][];
}

async function run(input: InvoiceWorkerInput): Promise<InvoiceWorkerResult> {
  const dictCustomer = new Map(input.masterMap);

  const totals = { retailSales: 0, retailTax: 0, serviceSales: 0, serviceTax: 0 };
  const aggregates = new Map<string, AggregateEntry>();
  const detailRows: SerializedCellValue[][] = [];
  let detailHeader: SerializedCellValue[] = [];
  let salesColIdx = 0;
  let taxColIdx = 0;

  let fileLastCol = 0;
  let salesIdx = 0;
  let taxIdx = 0;
  let noteIdx = 0;
  let customerIdx = 0;

  await readXlsxRows(input.filePath, (rowNum, values: XlsxCellValue[]) => {
    if (rowNum === input.headerRow) {
      fileLastCol = values.length - 1;
      const headerIdx = buildHeaderIndex(values);

      const sIdx = headerIdx.get(normalizeHeaderKey(input.salesColumn));
      const tIdx = headerIdx.get(normalizeHeaderKey(input.taxColumn));
      const nIdx = headerIdx.get(normalizeHeaderKey(input.noteColumn));
      const cIdx = headerIdx.get(normalizeHeaderKey(input.customerColumn));

      if (sIdx === undefined) {
        throw new Error(`Không tìm thấy cột doanh số "${input.salesColumn}" trong file "${input.originalName}" (dòng tiêu đề: ${input.headerRow}).`);
      }
      if (tIdx === undefined) {
        throw new Error(`Không tìm thấy cột thuế "${input.taxColumn}" trong file "${input.originalName}" (dòng tiêu đề: ${input.headerRow}).`);
      }
      if (nIdx === undefined) {
        throw new Error(`Không tìm thấy cột ghi chú "${input.noteColumn}" trong file "${input.originalName}" (dòng tiêu đề: ${input.headerRow}).`);
      }

      salesIdx = sIdx;
      taxIdx = tIdx;
      noteIdx = nIdx;
      customerIdx = cIdx ?? 0;
      salesColIdx = salesIdx;
      taxColIdx = taxIdx;

      detailHeader = values.slice(0, fileLastCol + 1).map(serializeCellValue);
      return;
    }

    if (rowNum < input.headerRow || fileLastCol === 0) return;

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
      detailRows.push(values.slice(0, fileLastCol + 1).map(serializeCellValue));
    }
  });

  return { detailHeader, salesColIdx, taxColIdx, totals, aggregates: [...aggregates.values()], detailRows };
}

// process.send() is async (writes to the IPC pipe) — calling process.exit() right after,
// without waiting for its callback, can kill the process before a large message finishes
// flushing, silently dropping the result. Exit only from inside the send callback.
process.on('message', (input: InvoiceWorkerInput) => {
  run(input)
    .then(data => {
      process.send?.({ ok: true, data }, () => process.exit(0));
    })
    .catch((err: unknown) => {
      process.send?.({ ok: false, error: err instanceof Error ? err.message : String(err) }, () => process.exit(1));
    });
});
