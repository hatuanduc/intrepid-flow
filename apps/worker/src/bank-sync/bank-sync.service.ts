import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { JOB_STATUS, FAIL_REASON } from './constants';
import { PlaywrightService } from './services/playwright.service';
import { ExcelService, type TransactionRow } from './services/excel.service';
import { SheetsService } from './services/sheets.service';

@Injectable()
export class BankSyncService {
  private readonly logger = new Logger(BankSyncService.name);
  private readonly prisma = new PrismaClient();

  constructor(
    private readonly playwright: PlaywrightService,
    private readonly excel: ExcelService,
    private readonly sheets: SheetsService,
  ) {}

  async run(jobId: string): Promise<void> {
    try {
      // ── Session / authentication phase ──────────────────────────────────
      await this.updateJob(jobId, JOB_STATUS.CHECKING_SESSION);
      await this.playwright.init();

      if (!(await this.playwright.isLoggedIn())) {
        await this.updateJob(jobId, JOB_STATUS.LOGGING_IN);
        const settings = await this.prisma.bankJobSettings.findUnique({ where: { id: 'default' } });
        const username = settings?.hsbcnetUsername ?? process.env.HSBCNET_USERNAME ?? '';
        await this.playwright.login(username);
        await this.updateJob(
          jobId,
          JOB_STATUS.WAITING_2FA,
          'Đang chờ xác thực 2FA trên điện thoại...',
        );
        await this.playwright.wait2FA();
        await this.playwright.saveSession();
      }

      await this.updateJob(jobId, JOB_STATUS.AUTHENTICATED);

      // ── Fetch active accounts from DB ────────────────────────────────────
      const accounts = await this.prisma.bankAccount.findMany({
        where: { isActive: true },
      });
      await this.log(jobId, `Tìm thấy ${accounts.length} tài khoản`);

      // ── Per-account download → parse → store → sync ───────────────────
      await this.updateJob(jobId, JOB_STATUS.DOWNLOADING);

      for (const account of accounts) {
        await this.log(jobId, `Đang tải ${account.accountNumber}...`);

        let excelBuffer: Buffer;
        try {
          excelBuffer = await this.playwright.downloadStatement(account.accountNumber);
        } catch (err) {
          const msg = (err as Error).message ?? 'Download error';
          await this.log(
            jobId,
            `${account.accountNumber}: lỗi tải file — ${msg} [${FAIL_REASON.DOWNLOAD_ERROR}]`,
          );
          continue;
        }

        // ── Parse ──────────────────────────────────────────────────────────
        await this.updateJob(jobId, JOB_STATUS.STORING);
        const { rows, validation, actualHeaders } = await this.excel.parse(excelBuffer);

        if (!validation.valid) {
          await this.log(
            jobId,
            `${account.accountNumber}: thiếu cột bắt buộc [${FAIL_REASON.MISSING_REQUIRED_COLUMNS}]: ${validation.missingRequired.join(', ')}`,
          );
          continue;
        }

        if (validation.missingOptional.length > 0) {
          await this.log(
            jobId,
            `${account.accountNumber}: cảnh báo — thiếu cột optional: ${validation.missingOptional.join(', ')}`,
          );
        }
        if (validation.extra.length > 0) {
          await this.log(
            jobId,
            `${account.accountNumber}: cảnh báo — cột không xác định: ${validation.extra.join(', ')}`,
          );
        }

        // ── Store ──────────────────────────────────────────────────────────
        const { inserted, duplicates } = await this.storeTransactions(
          jobId,
          account.id,
          account.accountNumber,
          rows,
        );
        await this.log(
          jobId,
          `${account.accountNumber}: ${inserted} mới, ${duplicates} trùng`,
        );

        // ── Sync to Google Sheets ──────────────────────────────────────────
        await this.updateJob(jobId, JOB_STATUS.SYNCING_SHEETS);
        try {
          await this.sheets.sync(account.accountNumber, rows);
          await this.log(jobId, `${account.accountNumber}: đã sync lên GSheets`);
        } catch (err) {
          const msg = (err as Error).message ?? 'Sheets error';
          await this.log(
            jobId,
            `${account.accountNumber}: lỗi GSheets — ${msg} [${FAIL_REASON.SHEET_ERROR}]`,
          );
        }
      }

      await this.playwright.close();
      await this.updateJob(jobId, JOB_STATUS.COMPLETED);
    } catch (err) {
      // Close browser on unexpected failure too
      try { await this.playwright.close(); } catch { /* ignore */ }

      const msg = (err as Error).message ?? 'Unknown error';
      await this.prisma.bankSyncJob.update({
        where: { id: jobId },
        data: { status: JOB_STATUS.FAILED, errorMessage: msg, completedAt: new Date() },
      });
      throw err;
    }
  }

  /**
   * Persist parsed rows to bank_transactions.
   * Computes dataHash here (accountNumber required) before inserting.
   * Unique-constraint violations are silently counted as duplicates.
   */
  private async storeTransactions(
    jobId: string,
    bankAccountId: string,
    accountNumber: string,
    rows: TransactionRow[],
  ): Promise<{ inserted: number; duplicates: number }> {
    let inserted = 0;
    let duplicates = 0;

    for (const row of rows) {
      const dataHash = ExcelService.hashRow(accountNumber, row);
      try {
        await this.prisma.bankTransaction.create({
          data: {
            bankAccountId,
            jobId,
            postDate: row.postDate,
            narrative: row.narrative,
            bankReference: row.bankReference,
            customerReference: row.customerReference,
            trnType: row.trnType,
            creditAmount: row.creditAmount,
            debitAmount: row.debitAmount,
            balance: row.balance,
            dataHash,
            rawData: row.rawData,
          },
        });
        inserted++;
      } catch {
        // Unique constraint on dataHash → duplicate row, skip silently
        duplicates++;
      }
    }

    return { inserted, duplicates };
  }

  private async updateJob(jobId: string, status: string, message?: string) {
    await this.prisma.bankSyncJob.update({
      where: { id: jobId },
      data: {
        status,
        ...(status === JOB_STATUS.COMPLETED || status === JOB_STATUS.FAILED
          ? { completedAt: new Date() }
          : {}),
      },
    });
    if (message) await this.log(jobId, message);
    this.logger.log(`[${jobId}] → ${status}`);
  }

  private async log(jobId: string, message: string) {
    const entry = { time: new Date().toISOString(), message };
    await this.prisma.$executeRaw`
      UPDATE bank_sync_jobs
      SET logs = logs || ${JSON.stringify([entry])}::jsonb
      WHERE id = ${jobId}
    `;
  }
}
