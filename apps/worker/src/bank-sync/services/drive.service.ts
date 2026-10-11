import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { google, drive_v3 } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

export type DriveUploadResult =
  | { skipped: true; reason: string }
  | { skipped: false; driveFileId: string; driveFileUrl: string | null };

@Injectable()
export class DriveService {
  private readonly logger = new Logger(DriveService.name);
  private readonly prisma = new PrismaClient();
  // Durable local store for the PDF mirror (see storePdfLocally() below) — a Docker named
  // volume mounted at this same path in both the api and worker containers, so api can
  // serve back what worker writes here. Replaces the S3 bucket this used before the app
  // stopped running on AWS; the s3Key DB column/field names stayed as-is (just holds a
  // relative path now) to avoid a schema migration.
  private readonly pdfDir = process.env.BANK_STATEMENT_PDF_DIR as string | undefined;

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
      supportsAllDrives: true,
    });

    const driveFileId = created.data.id;
    if (!driveFileId) throw new Error('Drive did not return a file id after upload');

    this.logger.log(`Uploaded "${fileName}" to Drive folder ${accountName}/${accountNumber}/${year}/${month}/${day}`);
    return { skipped: false, driveFileId, driveFileUrl: created.data.webViewLink ?? null };
  }

  /**
   * Durable local mirror so the app can serve the PDF itself (see bank-statement.service.ts's
   * getTransactionPdf()) without depending on the Drive folder's sharing permissions for
   * in-app viewing.
   *
   * Path layout mirrors uploadPdf()'s Drive folder hierarchy exactly — accountName /
   * accountNumber / year / year-month / day — no extra "bank-statement-pdfs/" prefix
   * (pdfDir itself is dedicated to this, per env — see BANK_STATEMENT_PDF_DIR — so a
   * prefix restating that is redundant, and previously meant this didn't line up with
   * Drive's structure: accountName was missing entirely and month wasn't
   * zero-padded-with-year, so the two couldn't be visually cross-referenced).
   */
  async storePdfLocally(accountName: string, accountNumber: string, postDate: Date, buffer: Buffer, fileName: string): Promise<{ skipped: true; reason: string } | { skipped: false; s3Key: string }> {
    if (!this.pdfDir) {
      this.logger.warn('BANK_STATEMENT_PDF_DIR not configured — skipping local PDF mirror');
      return { skipped: true, reason: 'no_bucket_configured' };
    }

    const year = String(postDate.getUTCFullYear());
    const month = `${year}-${String(postDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const day = String(postDate.getUTCDate()).padStart(2, '0');
    const key = `${accountName}/${accountNumber}/${year}/${month}/${day}/${fileName}`;

    const filePath = path.join(this.pdfDir, key);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, buffer);

    return { skipped: false, s3Key: key };
  }

  /**
   * Read a previously-uploaded PDF back out of the local mirror — lets the Drive-sync
   * retry path (see bank-sync.service.ts's syncPendingDriveUploads()) re-attempt just the
   * Drive upload for a PDF that's already secured here, without touching Playwright/HSBC
   * at all (the fetch and the Drive sync are independently retryable — see
   * BankTransactionPdf.status vs .driveSyncStatus in schema.prisma).
   */
  async readPdfLocally(s3Key: string): Promise<Buffer> {
    if (!this.pdfDir) throw new Error('BANK_STATEMENT_PDF_DIR not configured');
    return fs.promises.readFile(path.join(this.pdfDir, s3Key));
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
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });
  const existing = found.data.files?.[0]?.id;
  if (existing) return existing;

  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  const id = created.data.id;
  if (!id) throw new Error(`Drive did not return a folder id after creating "${name}"`);
  return id;
}
