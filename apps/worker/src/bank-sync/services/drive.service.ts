import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { google, drive_v3 } from 'googleapis';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export type DriveUploadResult =
  | { skipped: true; reason: string }
  | { skipped: false; driveFileId: string; driveFileUrl: string | null };

@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);
  private readonly prisma = new PrismaClient();
  private readonly s3 = new S3Client({});
  private readonly s3Bucket = process.env.BANK_STATEMENT_PDF_BUCKET as string | undefined;

  /**
   * Upload a transaction PDF into the configured Drive root folder for this
   * accountCode, under accountName/accountNumber/YYYY/YYYY-MM/DD (created on demand).
   *
   * Uses the same shared service-account credential as SheetsService
   * (SystemSettings.googleServiceKeyJson), just with the Drive scope instead of
   * Sheets — the admin needs to additionally share the target Drive folder with
   * that same service-account email (see ServiceAccountShareInfo in the web UI).
   */
  async uploadPdf(
    accountCode: string,
    accountName: string,
    accountNumber: string,
    postDate: Date,
    buffer: Buffer,
    fileName: string,
  ): Promise<DriveUploadResult> {
    const config = await this.prisma.bankDriveExportConfig.findUnique({ where: { accountCode } });
    if (!config || !config.isActive || !config.rootFolderId) {
      this.logger.warn(`No active Drive export config for accountCode ${accountCode} — skipping Drive upload`);
      return { skipped: true, reason: 'no_drive_config' };
    }

    const systemSettings = await this.prisma.systemSettings.findUnique({ where: { id: 'default' } });
    const serviceKeyJson = systemSettings?.googleServiceKeyJson ?? null;
    if (!serviceKeyJson) {
      this.logger.warn('No Google service account key configured — skipping Drive upload');
      return { skipped: true, reason: 'no_service_key' };
    }

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(serviceKeyJson) as Record<string, unknown>,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });

    const year = String(postDate.getUTCFullYear());
    const month = `${year}-${String(postDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const day = String(postDate.getUTCDate()).padStart(2, '0');

    let parentId = config.rootFolderId;
    for (const name of [accountName, accountNumber, year, month, day]) {
      parentId = await ensureFolder(drive, name, parentId);
    }

    const created = await drive.files.create({
      requestBody: { name: fileName, parents: [parentId] },
      media: { mimeType: 'application/pdf', body: Readable.from(buffer) },
      fields: 'id,webViewLink',
    });

    const driveFileId = created.data.id;
    if (!driveFileId) throw new Error('Drive did not return a file id after upload');

    this.logger.log(`Uploaded "${fileName}" to Drive folder ${accountName}/${accountNumber}/${year}/${month}/${day}`);
    return { skipped: false, driveFileId, driveFileUrl: created.data.webViewLink ?? null };
  }

  /**
   * Mirror copy in S3 so the app can serve the PDF itself (see reconcile.service.ts's
   * PutObjectCommand pattern) without depending on the Drive folder's sharing
   * permissions for in-app viewing.
   *
   * Key layout mirrors uploadPdf()'s Drive folder hierarchy exactly — accountName /
   * accountNumber / year / year-month / day — no extra "bank-statement-pdfs/" prefix
   * (the bucket itself is dedicated to this, per env — see BANK_STATEMENT_PDF_BUCKET —
   * so a prefix restating that is redundant, and previously meant this didn't line up
   * with Drive's structure: accountName was missing entirely and month wasn't
   * zero-padded-with-year, so the two couldn't be visually cross-referenced).
   */
  async uploadToS3(accountName: string, accountNumber: string, postDate: Date, buffer: Buffer, fileName: string): Promise<{ skipped: true; reason: string } | { skipped: false; s3Key: string }> {
    if (!this.s3Bucket) {
      this.logger.warn('BANK_STATEMENT_PDF_BUCKET not configured — skipping S3 upload');
      return { skipped: true, reason: 'no_bucket_configured' };
    }

    const year = String(postDate.getUTCFullYear());
    const month = `${year}-${String(postDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const day = String(postDate.getUTCDate()).padStart(2, '0');
    const key = `${accountName}/${accountNumber}/${year}/${month}/${day}/${fileName}`;

    await this.s3.send(new PutObjectCommand({
      Bucket: this.s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
    }));

    return { skipped: false, s3Key: key };
  }

  /**
   * Read a previously-uploaded PDF back out of S3 — lets the Drive-sync retry path
   * (see bank-sync.service.ts's syncPendingDriveUploads()) re-attempt just the Drive
   * upload for a PDF that's already secured in S3, without touching Playwright/HSBC
   * at all (the fetch and the Drive sync are independently retryable — see
   * BankTransactionPdf.status vs .driveSyncStatus in schema.prisma).
   */
  async downloadFromS3(s3Key: string): Promise<Buffer> {
    if (!this.s3Bucket) throw new Error('BANK_STATEMENT_PDF_BUCKET not configured');
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.s3Bucket, Key: s3Key }));
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
}

/**
 * Find a folder by name directly under `parentId`, creating it if it doesn't exist yet.
 * Mirrors sheets.service.ts's "find sheet by title, else create from scratch" pattern
 * (sheets.service.ts:84-153) — check first, never blindly create, so re-running the
 * same job (or a different account sharing the same country) doesn't spawn duplicate
 * folders each time.
 */
async function ensureFolder(drive: drive_v3.Drive, name: string, parentId: string): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const found = await drive.files.list({
    q: `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });
  const existing = found.data.files?.[0]?.id;
  if (existing) return existing;

  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  const id = created.data.id;
  if (!id) throw new Error(`Drive did not return a folder id after creating "${name}"`);
  return id;
}
