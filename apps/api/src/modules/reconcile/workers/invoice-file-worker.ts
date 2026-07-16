// Standalone script — not part of the Nest DI graph. Spawned via child_process.fork() from
// reconcile.service.ts, one process per invoice file. Runs the ExcelJS *streaming* reader (safe
// here because this process does exactly one read before exiting — see reconcile.service.ts's
// runInvoiceFileWorker() for why that matters) and reports the result back over IPC.
import * as ExcelJS from 'exceljs';
import type { CellValue } from 'exceljs';
import {
  buildHeaderIndex, cellToNumber, cellToString, extractBrandFromNote, serializeCellValue,
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

  const reader = new ExcelJS.stream.xlsx.WorkbookReader(input.filePath, {});

  let fileLastCol = 0;
  let salesIdx = 0;
  let taxIdx = 0;
  let noteIdx = 0;
  let customerIdx = 0;

  let sheetIndex = 0;
  for await (const worksheet of reader) {
    const isFirstSheet = sheetIndex++ === 0;
    let rowNum = 0;

    for await (const row of worksheet) {
      rowNum++;
      if (!isFirstSheet) continue; // still iterate to fully drain the stream

      const values = row.values as CellValue[];

      if (rowNum === input.headerRow) {
        fileLastCol = values.length - 1;
        const headerIdx = buildHeaderIndex(values);

        const sIdx = headerIdx.get(input.salesColumn.trim().toLowerCase());
        const tIdx = headerIdx.get(input.taxColumn.trim().toLowerCase());
        const nIdx = headerIdx.get(input.noteColumn.trim().toLowerCase());
        const cIdx = headerIdx.get(input.customerColumn.trim().toLowerCase());

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
        continue;
      }

      if (rowNum < input.headerRow || fileLastCol === 0) continue;

      const noteVal = cellToString(values[noteIdx]).trim();
      if (noteVal === '') continue; // blank Note -> skip entirely (no detail row, no aggregation)

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
    }
  }

  return { detailHeader, salesColIdx, taxColIdx, totals, aggregates: [...aggregates.values()], detailRows };
}

process.on('message', (input: InvoiceWorkerInput) => {
  run(input)
    .then(data => {
      process.send?.({ ok: true, data });
      process.exit(0);
    })
    .catch((err: unknown) => {
      process.send?.({ ok: false, error: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    });
});
