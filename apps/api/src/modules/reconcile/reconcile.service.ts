import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { CellValue } from 'exceljs';
import { fork, type ChildProcess } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildHeaderIndex, cellToString, deserializeCellValue, sanitizeOutputFileName,
  type RowType, type SerializedCellValue,
} from './reconcile-filter.util';

export interface UploadedInvoiceFile {
  path: string;
  originalName: string;
}

export interface FilterMergeOptions {
  headerRow: number;
  salesColumn: string;
  taxColumn: string;
  noteColumn: string;
  customerColumn: string;
  outputFileName: string;
}

interface AggregateEntry {
  customerName: string;
  typeLabel: RowType;
  sales: number;
  tax: number;
}

interface Totals {
  retailSales: number;
  retailTax: number;
  serviceSales: number;
  serviceTax: number;
}

// Mirrors the shape workers/invoice-file-worker.ts sends back over IPC on success.
interface InvoiceWorkerData {
  detailHeader: SerializedCellValue[];
  salesColIdx: number;
  taxColIdx: number;
  totals: Totals;
  aggregates: AggregateEntry[];
  detailRows: SerializedCellValue[][];
}

const MONEY_FORMAT = '#,##0.00';
const HEADER_FILL = 'FFDDEBF7';

// The Master Customer Name file's header names are effectively fixed (see
// macro-powertool/BusinessMaster.bas) — not exposed as a user-facing field,
// but still overridable via the DTO for the rare case it changes.
const DEFAULT_MASTER_BRAND_COLUMN = 'Brand name';
const DEFAULT_MASTER_CUSTOMER_COLUMN = 'Customer name';

@Injectable()
export class ReconcileService {
  constructor(private readonly prisma: PrismaService) {}

  async runFilterMerge(
    invoiceFiles: UploadedInvoiceFile[],
    outputFileName: string,
  ): Promise<{ path: string; filename: string }> {
    const settings = await this.getSettings();
    const opts: FilterMergeOptions = {
      headerRow: settings.headerRow,
      salesColumn: settings.salesColumn,
      taxColumn: settings.taxColumn,
      noteColumn: settings.noteColumn,
      customerColumn: settings.customerColumn,
      outputFileName,
    };

    const dictCustomer = await this.getMasterCustomerMapFromDb();
    const masterMap: [string, string][] = [...dictCustomer.entries()];

    const totals: Totals = { retailSales: 0, retailTax: 0, serviceSales: 0, serviceTax: 0 };
    const aggregates = new Map<string, AggregateEntry>();
    const detailRows: CellValue[][] = [];
    let detailHeader: CellValue[] | null = null;
    let salesColOut = 0;
    let taxColOut = 0;

    // Each file is processed in its own short-lived child process (see runInvoiceFileWorker) —
    // sequentially, not in parallel, to keep peak memory bounded to ~one file at a time.
    for (const file of invoiceFiles) {
      const result = await this.runInvoiceFileWorker(file, opts, masterMap);

      if (detailHeader === null) {
        detailHeader = result.detailHeader.map(deserializeCellValue);
        salesColOut = result.salesColIdx;
        taxColOut = result.taxColIdx;
      }

      totals.retailSales += result.totals.retailSales;
      totals.retailTax += result.totals.retailTax;
      totals.serviceSales += result.totals.serviceSales;
      totals.serviceTax += result.totals.serviceTax;

      for (const entry of result.aggregates) {
        const key = `${entry.customerName}|${entry.typeLabel}`;
        const existing = aggregates.get(key) ?? { customerName: entry.customerName, typeLabel: entry.typeLabel, sales: 0, tax: 0 };
        existing.sales += entry.sales;
        existing.tax += entry.tax;
        aggregates.set(key, existing);
      }

      for (const row of result.detailRows) {
        detailRows.push(row.map(deserializeCellValue));
      }
    }

    const outPath = path.join(os.tmpdir(), `reconcile-out-${randomUUID()}.xlsx`);
    await this.buildOutputWorkbook(outPath, {
      detailHeader: detailHeader ?? [],
      detailRows,
      salesColOut,
      taxColOut,
      totals,
      aggregates: [...aggregates.values()],
      opts,
    });

    return { path: outPath, filename: sanitizeOutputFileName(opts.outputFileName) };
  }

  async getSettings() {
    const settings = await this.prisma.reconcileSettings.findUnique({ where: { id: 'default' } });
    if (!settings) throw new NotFoundException('RECONCILE_SETTINGS_NOT_FOUND');
    return settings;
  }

  async updateSettings(data: {
    headerRow: number;
    salesColumn: string;
    taxColumn: string;
    noteColumn: string;
    customerColumn: string;
  }) {
    return this.prisma.reconcileSettings.update({ where: { id: 'default' }, data });
  }

  async getMasterCustomerInfo(): Promise<{
    count: number;
    updatedAt: string | null;
    items: { brandName: string; customerName: string }[];
  }> {
    const [rows, latest] = await Promise.all([
      this.prisma.masterCustomerMapping.findMany({
        orderBy: { brandName: 'asc' },
        select: { brandName: true, customerName: true },
      }),
      this.prisma.masterCustomerMapping.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ]);
    return { count: rows.length, updatedAt: latest?.updatedAt.toISOString() ?? null, items: rows };
  }

  async replaceMasterCustomerData(
    file: UploadedInvoiceFile,
    brandCol?: string,
    customerCol?: string,
  ): Promise<{ count: number; updatedAt: string | null }> {
    const dict = await this.readMasterCustomerMap(
      file,
      brandCol?.trim() || DEFAULT_MASTER_BRAND_COLUMN,
      customerCol?.trim() || DEFAULT_MASTER_CUSTOMER_COLUMN,
    );

    await this.prisma.$transaction([
      this.prisma.masterCustomerMapping.deleteMany({}),
      this.prisma.masterCustomerMapping.createMany({
        data: [...dict.entries()].map(([brandName, customerName]) => ({ brandName, customerName })),
      }),
    ]);

    return this.getMasterCustomerInfo();
  }

  private async getMasterCustomerMapFromDb(): Promise<Map<string, string>> {
    const rows = await this.prisma.masterCustomerMapping.findMany();
    return new Map(rows.map(r => [r.brandName, r.customerName]));
  }

  private async readMasterCustomerMap(
    file: UploadedInvoiceFile,
    brandCol: string,
    customerCol: string,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file.path);
    const worksheet = workbook.worksheets[0];

    let headerIdx: Map<string, number> | null = null;
    let brandIdx: number | undefined;
    let custIdx: number | undefined;

    worksheet.eachRow((row, rowNum) => {
      const values = row.values as CellValue[];

      if (rowNum === 1) {
        headerIdx = buildHeaderIndex(values);
        brandIdx = headerIdx.get(brandCol.trim().toLowerCase());
        custIdx = headerIdx.get(customerCol.trim().toLowerCase());
        if (brandIdx === undefined) {
          throw new UnprocessableEntityException(
            `Không tìm thấy cột "${brandCol}" trong file Master Customer "${file.originalName}" (dòng tiêu đề: 1).`,
          );
        }
        if (custIdx === undefined) {
          throw new UnprocessableEntityException(
            `Không tìm thấy cột "${customerCol}" trong file Master Customer "${file.originalName}" (dòng tiêu đề: 1).`,
          );
        }
        return;
      }

      if (brandIdx === undefined || custIdx === undefined) return;

      const brand = cellToString(values[brandIdx]).trim().toUpperCase();
      const customer = cellToString(values[custIdx]).trim().toUpperCase();
      if (brand && !map.has(brand)) map.set(brand, customer);
    });

    return map;
  }

  // Runs one invoice file's parsing in a dedicated child process (workers/invoice-file-worker.ts).
  // Two reasons this isn't done in-process: (1) ExcelJS's streaming reader is memory-efficient but
  // was found to break on the 2nd+ sequential read within a single process — a fresh process per
  // file sidesteps that entirely; (2) the OS reclaims 100% of that file's memory the instant the
  // child exits, instead of depending on this long-lived server process's GC timing.
  private async runInvoiceFileWorker(
    file: UploadedInvoiceFile,
    opts: FilterMergeOptions,
    masterMap: [string, string][],
  ): Promise<InvoiceWorkerData> {
    const isTs = __filename.endsWith('.ts');
    const workerPath = path.join(__dirname, 'workers', isTs ? 'invoice-file-worker.ts' : 'invoice-file-worker.js');
    const execArgv = isTs ? ['--require', 'tsx/cjs'] : ['--max-old-space-size=1024'];

    let child: ChildProcess | undefined;
    try {
      return await new Promise<InvoiceWorkerData>((resolve, reject) => {
        child = fork(workerPath, [], { execArgv, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });

        const timeout = setTimeout(() => {
          child?.kill();
          reject(new UnprocessableEntityException(
            `Xử lý file "${file.originalName}" quá lâu (quá 5 phút), đã hủy.`,
          ));
        }, 5 * 60 * 1000);

        child.on('message', (msg: { ok: true; data: InvoiceWorkerData } | { ok: false; error: string }) => {
          clearTimeout(timeout);
          if (msg.ok) resolve(msg.data);
          else reject(new UnprocessableEntityException(msg.error));
        });

        child.on('error', err => {
          clearTimeout(timeout);
          reject(new UnprocessableEntityException(
            `Không thể xử lý file "${file.originalName}": ${err.message}`,
          ));
        });

        child.on('exit', code => {
          clearTimeout(timeout);
          if (code !== 0 && code !== null) {
            reject(new UnprocessableEntityException(
              `Xử lý file "${file.originalName}" thất bại (tiến trình con thoát với mã lỗi ${code}).`,
            ));
          }
        });

        child.send({
          filePath: file.path,
          originalName: file.originalName,
          headerRow: opts.headerRow,
          salesColumn: opts.salesColumn,
          taxColumn: opts.taxColumn,
          noteColumn: opts.noteColumn,
          customerColumn: opts.customerColumn,
          masterMap,
        });
      });
    } finally {
      child?.kill();
    }
  }

  private async buildOutputWorkbook(
    outPath: string,
    data: {
      detailHeader: CellValue[];
      detailRows: CellValue[][];
      salesColOut: number;
      taxColOut: number;
      totals: Totals;
      aggregates: AggregateEntry[];
      opts: FilterMergeOptions;
    },
  ): Promise<void> {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: outPath,
      useStyles: true,
      useSharedStrings: true,
    });

    // ── Summary sheet ──
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

    // ── Service_Invoices_Detail sheet ──
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

    let outRowNum = 5;
    for (const values of data.detailRows) {
      const row = detail.getRow(outRowNum);
      values.forEach((v, idx) => {
        if (idx > 0) row.getCell(idx).value = v;
      });
      if (data.salesColOut > 0) row.getCell(data.salesColOut).numFmt = MONEY_FORMAT;
      if (data.taxColOut > 0) row.getCell(data.taxColOut).numFmt = MONEY_FORMAT;
      row.commit();
      outRowNum++;
    }

    detail.commit();
    await workbook.commit();
  }
}
