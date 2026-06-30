import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { JOB_STATUS, FAIL_REASON } from './constants';
import { PlaywrightService, computeDateRange, type DiscoveredAccount } from './services/playwright.service';
import { ExcelService, type TransactionRow } from './services/excel.service';
import { SheetsService } from './services/sheets.service';

type StepKey = 'bank_sync' | 'sheets_sync';
type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

type JobStep = {
  key: StepKey;
  label: string;
  status: StepStatus;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
};

const INITIAL_STEPS: JobStep[] = [
  { key: 'bank_sync',   label: 'Lấy sao kê',       status: 'pending', startedAt: null, completedAt: null, errorMessage: null },
  { key: 'sheets_sync', label: 'Đồng bộ GSheets',  status: 'pending', startedAt: null, completedAt: null, errorMessage: null },
];

function parseSteps(raw: unknown): JobStep[] {
  if (!Array.isArray(raw) || raw.length === 0) return INITIAL_STEPS.map(s => ({ ...s }));
  return raw as JobStep[];
}

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
    const job = await this.prisma.bankSyncJob.findUnique({ where: { id: jobId } });
    const steps = parseSteps(job?.steps);

    const step1Done = steps.find(s => s.key === 'bank_sync')?.status === 'completed';
    const step2Done = steps.find(s => s.key === 'sheets_sync')?.status === 'completed';

    try {
      // ── Step 1: Lấy sao kê ngân hàng ──────────────────────────────────────
      let accountRows = new Map<string, TransactionRow[]>();

      if (!step1Done) {
        await this.updateStep(jobId, 'bank_sync', { status: 'running', startedAt: new Date().toISOString() });
        accountRows = await this.runBankSync(jobId);
        await this.updateStep(jobId, 'bank_sync', { status: 'completed', completedAt: new Date().toISOString() });
      } else {
        await this.log(jobId, 'Bước 1 đã hoàn thành trước đó — nạp dữ liệu từ DB.', 'sheets_sync', 'success');
        accountRows = await this.loadTransactionsForJob(jobId);
        await this.log(jobId, `Nạp ${accountRows.size} tài khoản từ DB.`, 'sheets_sync');
      }

      // ── Step 2: Đồng bộ Google Sheets ─────────────────────────────────────
      if (!step2Done) {
        await this.updateStep(jobId, 'sheets_sync', { status: 'running', startedAt: new Date().toISOString() });
        await this.updateJob(jobId, JOB_STATUS.SYNCING_SHEETS);
        await this.log(jobId, `Bắt đầu đồng bộ ${accountRows.size} tài khoản lên Google Sheets...`, 'sheets_sync');
        await this.runSheetsSync(jobId, accountRows);
        await this.updateStep(jobId, 'sheets_sync', { status: 'completed', completedAt: new Date().toISOString() });
        await this.log(jobId, 'Hoàn thành bước 2 — đã đồng bộ lên Google Sheets.', 'sheets_sync', 'success');
      }

      await this.updateJob(jobId, JOB_STATUS.COMPLETED);
      await this.log(jobId, 'Job hoàn thành thành công.', undefined, 'success');
    } catch (err) {
      try { await this.playwright.close(); } catch { /* ignore */ }

      const msg = (err as Error).message ?? 'Unknown error';

      // Mark the currently running step as failed
      const current = await this.prisma.bankSyncJob.findUnique({ where: { id: jobId }, select: { steps: true } });
      const currentSteps = parseSteps(current?.steps);
      const runningStep = currentSteps.find(s => s.status === 'running');
      if (runningStep) {
        await this.updateStep(jobId, runningStep.key, {
          status: 'failed',
          completedAt: new Date().toISOString(),
          errorMessage: msg,
        });
      }

      await this.prisma.bankSyncJob.update({
        where: { id: jobId },
        data: { status: JOB_STATUS.FAILED, errorMessage: msg, completedAt: new Date() },
      });
      throw err;
    }
  }

  // ─── Step 1: Bank sync (login → discover → download → parse → store) ────────

  private async runBankSync(jobId: string): Promise<Map<string, TransactionRow[]>> {
    const result = new Map<string, TransactionRow[]>();

    // ── 1a. Browser + auth ────────────────────────────────────────────────────
    await this.playwright.init();
    await this.log(jobId, 'Trình duyệt đã sẵn sàng — đang kiểm tra phiên đăng nhập...', 'bank_sync');
    await this.updateJob(jobId, JOB_STATUS.CHECKING_SESSION);

    const settings = await this.prisma.bankJobSettings.findUnique({ where: { id: 'default' } });

    if (!(await this.playwright.isLoggedIn())) {
      await this.log(jobId, 'Phiên đăng nhập hết hạn — bắt đầu đăng nhập lại.', 'bank_sync', 'warn');
      await this.updateJob(jobId, JOB_STATUS.LOGGING_IN);
      const username = settings?.hsbcnetUsername ?? process.env.HSBCNET_USERNAME ?? '';
      await this.playwright.login(username);
      await this.log(jobId, `Đã nhập tên đăng nhập (${username}) — chờ xác thực 2FA trên điện thoại...`, 'bank_sync');
      await this.updateJob(jobId, JOB_STATUS.WAITING_2FA);
      await this.playwright.wait2FA();
      await this.log(jobId, '2FA xác nhận thành công.', 'bank_sync', 'success');
      await this.playwright.saveSession();
      await this.log(jobId, 'Phiên đăng nhập đã được lưu để dùng lại lần sau.', 'bank_sync', 'success');
    } else {
      await this.log(jobId, 'Phiên đăng nhập còn hiệu lực — bỏ qua bước xác thực.', 'bank_sync', 'success');
    }

    await this.updateJob(jobId, JOB_STATUS.AUTHENTICATED);
    await this.log(jobId, 'Đã xác thực thành công.', 'bank_sync', 'success');

    // ── 1b. Account discovery ─────────────────────────────────────────────────
    await this.log(jobId, 'Đang quét danh sách tài khoản từ HSBCnet...', 'bank_sync');
    let discovered: DiscoveredAccount[] = [];
    try {
      discovered = await this.playwright.discoverAccounts();
      await this.log(jobId, `Phát hiện ${discovered.length} tài khoản trên HSBCnet.`, 'bank_sync');
    } catch (err) {
      const msg = (err as Error).message ?? 'Discovery error';
      await this.log(jobId, `Cảnh báo: không thể quét danh sách tài khoản — ${msg}. Tiếp tục với tài khoản trong DB.`, 'bank_sync', 'warn');
    }

    if (discovered.length > 0) {
      const newAccounts = await this.syncDiscoveredAccounts(jobId, discovered);
      if (newAccounts > 0) {
        await this.log(jobId, `★ ${newAccounts} tài khoản mới được phát hiện và thêm vào hệ thống.`, 'bank_sync', 'success');
      }
    }

    // ── 1c. Compute date range from settings ──────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySettings = settings as any;
    const dateMode: string = anySettings?.syncDateMode ?? 'yesterday';
    const customDays: number = anySettings?.syncCustomDays ?? 1;
    const { from: dateFrom, to: dateTo } = computeDateRange(dateMode, customDays);
    const rangeLabel = `${formatDateLabel(dateFrom)} → ${formatDateLabel(dateTo)}`;
    await this.log(jobId, `Khoảng ngày đồng bộ: ${rangeLabel} (chế độ: ${dateMode}).`, 'bank_sync');

    // ── 1d. Download per active account ──────────────────────────────────────
    const accounts = await this.prisma.bankAccount.findMany({ where: { isActive: true } });
    await this.log(jobId, `Bắt đầu tải sao kê cho ${accounts.length} tài khoản...`, 'bank_sync');
    await this.updateJob(jobId, JOB_STATUS.DOWNLOADING);

    for (const account of accounts) {
      await this.log(jobId, `Đang tải ${account.accountNumber}...`, 'bank_sync');

      let excelBuffer: Buffer | null;
      try {
        excelBuffer = await this.playwright.downloadStatement(account.accountNumber, dateFrom, dateTo);
      } catch (err) {
        const msg = (err as Error).message ?? 'Download error';
        await this.log(jobId, `${account.accountNumber}: lỗi tải file — ${msg} [${FAIL_REASON.DOWNLOAD_ERROR}]`, 'bank_sync', 'error');
        continue;
      }

      if (excelBuffer === null) {
        await this.log(jobId, `${account.accountNumber}: không có giao dịch trong khoảng ${rangeLabel} — bỏ qua.`, 'bank_sync', 'warn');
        continue;
      }

      await this.log(jobId, `${account.accountNumber}: tải file thành công (${(excelBuffer.length / 1024).toFixed(1)} KB).`, 'bank_sync', 'success');

      await this.updateJob(jobId, JOB_STATUS.STORING);
      const { rows, validation } = await this.excel.parse(excelBuffer);
      await this.log(jobId, `${account.accountNumber}: đọc được ${rows.length} dòng giao dịch.`, 'bank_sync');

      if (!validation.valid) {
        await this.log(jobId, `${account.accountNumber}: thiếu cột bắt buộc — ${validation.missingRequired.join(', ')} [${FAIL_REASON.MISSING_REQUIRED_COLUMNS}]`, 'bank_sync', 'error');
        continue;
      }
      if (validation.missingOptional.length > 0) {
        await this.log(jobId, `${account.accountNumber}: cảnh báo — thiếu cột optional: ${validation.missingOptional.join(', ')}`, 'bank_sync', 'warn');
      }

      const { inserted, duplicates } = await this.storeTransactions(jobId, account.id, account.accountNumber, rows);
      await this.log(jobId, `${account.accountNumber}: lưu xong — ${inserted} giao dịch mới, ${duplicates} trùng (bỏ qua).`, 'bank_sync', 'success');

      result.set(account.accountNumber, rows);
    }

    await this.log(jobId, `Hoàn thành bước 1 — đã xử lý ${result.size}/${accounts.length} tài khoản.`, 'bank_sync', 'success');
    // Browser stays open — session reused by next job run
    return result;
  }

  /**
   * Upsert discovered accounts into bank_accounts table.
   * Returns count of newly inserted accounts.
   */
  private async syncDiscoveredAccounts(jobId: string, discovered: DiscoveredAccount[]): Promise<number> {
    let newCount = 0;
    for (const acc of discovered) {
      const existing = await this.prisma.bankAccount.findUnique({ where: { accountNumber: acc.accountNumber } });
      if (existing) continue;

      await this.prisma.bankAccount.create({
        data: {
          accountNumber: acc.accountNumber,
          accountName: acc.companyName || acc.accountNumber,
          bankName: 'HSBC',
          currency: acc.currency,
          countryCode: acc.countryCode,
          isActive: true,
        },
      });
      await this.log(jobId, `Tài khoản mới: ${acc.accountNumber} (${acc.companyName}, ${acc.currency}) — đã thêm vào hệ thống.`, 'bank_sync', 'success');
      newCount++;
    }
    return newCount;
  }

  // ─── Step 2: Sheets sync (read DB → push GSheets) ───────────────────────────

  private async runSheetsSync(jobId: string, accountRows: Map<string, TransactionRow[]>): Promise<void> {
    if (accountRows.size === 0) {
      await this.log(jobId, 'Không có tài khoản nào để đồng bộ lên GSheets.', 'sheets_sync');
      return;
    }

    for (const [accountNumber, rows] of accountRows) {
      try {
        await this.sheets.sync(accountNumber, rows);
        await this.log(jobId, `${accountNumber}: đã sync lên GSheets`, 'sheets_sync', 'success');
      } catch (err) {
        const msg = (err as Error).message ?? 'Sheets error';
        await this.log(jobId, `${accountNumber}: lỗi GSheets — ${msg} [${FAIL_REASON.SHEET_ERROR}]`, 'sheets_sync', 'error');
      }
    }
  }

  // ─── Load existing transactions from DB (for step2 retry) ───────────────────

  private async loadTransactionsForJob(jobId: string): Promise<Map<string, TransactionRow[]>> {
    const txns = await this.prisma.bankTransaction.findMany({
      where: { jobId },
      include: { bankAccount: { select: { accountNumber: true } } },
    });

    const result = new Map<string, TransactionRow[]>();
    for (const txn of txns) {
      const acc = txn.bankAccount.accountNumber;
      if (!result.has(acc)) result.set(acc, []);
      result.get(acc)!.push({
        postDate: txn.postDate,
        narrative: txn.narrative ?? undefined,
        bankReference: txn.bankReference ?? undefined,
        customerReference: txn.customerReference ?? undefined,
        trnType: txn.trnType ?? undefined,
        creditAmount: txn.creditAmount != null ? Number(txn.creditAmount) : undefined,
        debitAmount: txn.debitAmount != null ? Number(txn.debitAmount) : undefined,
        balance: txn.balance != null ? Number(txn.balance) : undefined,
        rawData: txn.rawData as Record<string, unknown>,
      });
    }
    return result;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

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
        duplicates++;
      }
    }

    return { inserted, duplicates };
  }

  private async updateStep(jobId: string, stepKey: StepKey, updates: Partial<JobStep>) {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { id: jobId }, select: { steps: true } });
    const steps = parseSteps(job?.steps);
    const idx = steps.findIndex(s => s.key === stepKey);
    if (idx >= 0) Object.assign(steps[idx], updates);
    await this.prisma.bankSyncJob.update({ where: { id: jobId }, data: { steps } });
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

  private async log(
    jobId: string,
    message: string,
    step?: string,
    level: 'info' | 'success' | 'warn' | 'error' = 'info',
  ) {
    const entry: Record<string, unknown> = { time: new Date().toISOString(), message, level };
    if (step) entry.step = step;
    await this.prisma.$executeRaw`
      UPDATE bank_sync_jobs
      SET logs = logs || ${JSON.stringify([entry])}::jsonb
      WHERE id = ${jobId}
    `;
  }
}

function formatDateLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
