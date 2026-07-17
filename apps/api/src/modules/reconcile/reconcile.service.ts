import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import type { CellValue } from 'exceljs';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type { Readable } from 'stream';
import { PrismaService } from '../../prisma/prisma.service';
import { buildHeaderIndex, cellToString, normalizeHeaderKey, sanitizeOutputFileName } from './reconcile-filter.util';

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
}

export type FilterMergeStatus =
  | { status: 'processing' }
  | { status: 'done' }
  | { status: 'error'; message: string };

// The Master Customer Name file's header names are effectively fixed (see
// macro-powertool/BusinessMaster.bas) — not exposed as a user-facing field,
// but still overridable via the DTO for the rare case it changes.
const DEFAULT_MASTER_BRAND_COLUMN = 'Brand name';
const DEFAULT_MASTER_CUSTOMER_COLUMN = 'Customer name';

@Injectable()
export class ReconcileService {
  // The actual invoice parsing/merging runs in a separate Lambda (apps/reconcile-lambda) instead
  // of a forked child process on this host — a single 50MB invoice file could peak at multiple GB
  // of RAM, which isn't safe to run inline on the same EC2 host as web/api/worker/db/redis. This
  // service's job is now just: stage the uploaded files in S3, invoke the Lambda asynchronously,
  // and let the caller poll/download via S3 — see getFilterMergeStatus()/downloadFilterMergeResult().
  private readonly s3 = new S3Client({});
  private readonly lambda = new LambdaClient({});
  private readonly bucket = process.env.RECONCILE_BUCKET as string;
  private readonly lambdaName = process.env.RECONCILE_LAMBDA_NAME as string;

  constructor(private readonly prisma: PrismaService) {}

  async startFilterMerge(
    invoiceFiles: UploadedInvoiceFile[],
    outputFileName: string,
  ): Promise<{ jobId: string }> {
    const settings = await this.getSettings();
    const opts: FilterMergeOptions = {
      headerRow: settings.headerRow,
      salesColumn: settings.salesColumn,
      taxColumn: settings.taxColumn,
      noteColumn: settings.noteColumn,
      customerColumn: settings.customerColumn,
    };

    const dictCustomer = await this.getMasterCustomerMapFromDb();
    const masterMap: [string, string][] = [...dictCustomer.entries()];

    const jobId = randomUUID();
    const inputFiles: { key: string; originalName: string }[] = [];
    for (let i = 0; i < invoiceFiles.length; i++) {
      const file = invoiceFiles[i];
      const key = `input/${jobId}/${i}${path.extname(file.originalName) || '.xlsx'}`;
      const body = await fs.promises.readFile(file.path);
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body }));
      inputFiles.push({ key, originalName: file.originalName });
    }

    const outputKey = `output/${jobId}.xlsx`;
    await this.lambda.send(new InvokeCommand({
      FunctionName: this.lambdaName,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({
        jobId,
        bucket: this.bucket,
        outputKey,
        outputFileName: sanitizeOutputFileName(outputFileName),
        inputFiles,
        opts,
        masterMap,
      })),
    }));

    return { jobId };
  }

  async getFilterMergeStatus(jobId: string): Promise<FilterMergeStatus> {
    const outputKey = `output/${jobId}.xlsx`;

    const isDone = await this.s3
      .send(new HeadObjectCommand({ Bucket: this.bucket, Key: outputKey }))
      .then(() => true)
      .catch(() => false);
    if (isDone) return { status: 'done' };

    const errorBody = await this.s3
      .send(new GetObjectCommand({ Bucket: this.bucket, Key: `${outputKey}.error.json` }))
      .then(res => res.Body?.transformToString())
      .catch(() => undefined);
    if (errorBody) {
      const parsed = JSON.parse(errorBody) as { message?: string };
      return { status: 'error', message: parsed.message ?? 'Xử lý thất bại.' };
    }

    return { status: 'processing' };
  }

  async downloadFilterMergeResult(jobId: string): Promise<{ stream: Readable; filename: string; contentType: string }> {
    const outputKey = `output/${jobId}.xlsx`;
    let res;
    try {
      res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: outputKey }));
    } catch {
      throw new NotFoundException('RECONCILE_RESULT_NOT_FOUND');
    }

    const encodedName = res.Metadata?.['output-filename'];
    const filename = encodedName ? decodeURIComponent(encodedName) : 'service_invoices_merged.xlsx';

    return {
      stream: res.Body as Readable,
      filename,
      contentType: res.ContentType ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
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
        brandIdx = headerIdx.get(normalizeHeaderKey(brandCol));
        custIdx = headerIdx.get(normalizeHeaderKey(customerCol));
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
}
