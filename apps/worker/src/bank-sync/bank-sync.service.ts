import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { JOB_STATUS, FAIL_REASON } from './constants';
import { PlaywrightService, computeDateRange } from './services/playwright.service';
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
    const settings = await this.prisma.bankJobSettings.findUnique({ where: { id: 'default' } });
    if (!settings?.hsbcnetUsername) {
      await this.prisma.bankSyncJob.update({
        where: { id: jobId },
        data: { status: JOB_STATUS.FAILED, errorMessage: 'HSBCNET_USERNAME_NOT_CONFIGURED', completedAt: new Date() },
      });
      throw new Error('HSBCNET_USERNAME_NOT_CONFIGURED');
    }

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
        await this.log(jobId, 'Bank sync already completed — loading transactions from DB.', 'sheets_sync', 'success');
        accountRows = await this.loadTransactionsForJob(jobId);
        await this.log(jobId, `Loaded ${pl(accountRows.size, 'account number')} from DB.`, 'sheets_sync');
      }

      // ── Step 2: Đồng bộ Google Sheets ─────────────────────────────────────
      if (!step2Done) {
        if (accountRows.size === 0) {
          await this.log(jobId, 'No new transactions — GSheets sync not needed.', 'sheets_sync', 'success');
          await this.updateStep(jobId, 'sheets_sync', {
            status: 'completed',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          });
        } else {
          await this.updateStep(jobId, 'sheets_sync', { status: 'running', startedAt: new Date().toISOString() });
          await this.updateJob(jobId, JOB_STATUS.SYNCING_SHEETS);
          await this.log(jobId, `Syncing ${pl(accountRows.size, 'account number')} to Google Sheets...`, 'sheets_sync');
          await this.runSheetsSync(jobId, accountRows);
          await this.updateStep(jobId, 'sheets_sync', { status: 'completed', completedAt: new Date().toISOString() });
        }
      }

      await this.updateJob(jobId, JOB_STATUS.COMPLETED);
      await this.log(jobId, 'Job completed successfully.', undefined, 'success');
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
    await this.log(jobId, 'Browser ready — checking session...', 'bank_sync');
    await this.updateJob(jobId, JOB_STATUS.CHECKING_SESSION);

    const settings = await this.prisma.bankJobSettings.findUnique({ where: { id: 'default' } });

    if (!(await this.playwright.isLoggedIn())) {
      await this.log(jobId, 'Session expired — logging in.', 'bank_sync');
      await this.updateJob(jobId, JOB_STATUS.LOGGING_IN);
      const username = settings?.hsbcnetUsername ?? '';
      if (!username) {
        throw new Error('HSBCNET_USERNAME_NOT_CONFIGURED');
      }
      await this.playwright.login(username);
      await this.log(jobId, `Username entered (${username}) — waiting for 2FA on phone...`, 'bank_sync');
      await this.updateJob(jobId, JOB_STATUS.WAITING_2FA);
      await this.playwright.wait2FA();
      await this.log(jobId, '2FA confirmed.', 'bank_sync', 'success');
      await this.playwright.saveSession();
      await this.log(jobId, 'Session saved for reuse.', 'bank_sync', 'success');
    } else {
      await this.log(jobId, 'Session still valid — skipping authentication.', 'bank_sync', 'success');
    }

    await this.updateJob(jobId, JOB_STATUS.AUTHENTICATED);
    await this.log(jobId, 'Authenticated successfully.', 'bank_sync', 'success');

    // ── 1b. Compute date range from settings ─────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySettings = settings as any;
    const dateMode: string = anySettings?.syncDateMode ?? 'yesterday';
    const customDays: number = anySettings?.syncCustomDays ?? 1;
    const { from: dateFrom, to: dateTo } = computeDateRange(dateMode, customDays);
    const rangeLabel = `${formatDateLabel(dateFrom)} → ${formatDateLabel(dateTo)}`;
    await this.log(jobId, `Date range: ${rangeLabel} (mode: ${dateMode}).`, 'bank_sync');

    // ── 1c. Download per active account (grouped by accountName) ─────────────
    const accounts = await this.prisma.bankAccount.findMany({
      where: { isActive: true },
      orderBy: [{ accountName: 'asc' }, { accountNumber: 'asc' }],
    });

    // Group by accountName
    const groups = new Map<string, typeof accounts>();
    for (const account of accounts) {
      if (!groups.has(account.accountName)) groups.set(account.accountName, []);
      groups.get(account.accountName)!.push(account);
    }

    await this.log(jobId, `Starting fetch — ${pl(groups.size, 'account name')}, ${pl(accounts.length, 'account number')}, range ${rangeLabel}.`, 'bank_sync');
    await this.updateJob(jobId, JOB_STATUS.DOWNLOADING);

    let withNew = 0;
    let alreadyUpToDate = 0;

    for (const [groupName, groupAccounts] of groups) {
      await this.log(jobId, `${groupName} (${pl(groupAccounts.length, 'account number')}):`, 'bank_sync');

      for (const account of groupAccounts) {
        await this.log(jobId, `  → Fetching ${account.accountNumber}...`, 'bank_sync');

        let excelBuffer: Buffer | null;
        try {
          excelBuffer = await this.playwright.downloadStatement(account.accountNumber, dateFrom, dateTo);
        } catch (err) {
          const msg = (err as Error).message ?? 'Download error';
          await this.log(jobId, `  → ${account.accountNumber}: fetch failed — ${msg} [${FAIL_REASON.DOWNLOAD_ERROR}]`, 'bank_sync', 'error');
          continue;
        }

        if (excelBuffer === null) {
          await this.log(jobId, `  → ${account.accountNumber}: no transactions in range.`, 'bank_sync');
          continue;
        }

        await this.log(jobId, `  → ${account.accountNumber}: Excel statement fetched.`, 'bank_sync', 'success');

        await this.updateJob(jobId, JOB_STATUS.STORING);
        const { rows, validation } = await this.excel.parse(excelBuffer);
        await this.log(jobId, `  → ${account.accountNumber}: parsed ${pl(rows.length, 'transaction row')}.`, 'bank_sync');

        if (!validation.valid) {
          await this.log(jobId, `  → ${account.accountNumber}: missing required columns — ${validation.missingRequired.join(', ')} [${FAIL_REASON.MISSING_REQUIRED_COLUMNS}]`, 'bank_sync', 'error');
          continue;
        }
        if (validation.missingOptional.length > 0) {
          await this.log(jobId, `  → ${account.accountNumber}: missing optional columns — ${validation.missingOptional.join(', ')}`, 'bank_sync', 'warn');
        }

        const { inserted, duplicates } = await this.storeTransactions(jobId, account.id, account.accountNumber, rows);
        await this.log(jobId, `  → ${account.accountNumber}: stored — ${inserted} new, ${pl(duplicates, 'duplicate')}.`, 'bank_sync', inserted > 0 ? 'success' : 'warn');

        if (inserted > 0) {
          result.set(account.accountNumber, rows);
          withNew++;
        } else {
          alreadyUpToDate++;
        }
      }
    }

    let summaryMsg: string;
    if (withNew === 0 && alreadyUpToDate === 0) {
      summaryMsg = `Done — ${pl(accounts.length, 'account number')} checked, no transactions in range ${rangeLabel}.`;
    } else if (withNew === 0) {
      summaryMsg = `Done — ${pl(accounts.length, 'account number')} checked, all already up to date.`;
    } else if (alreadyUpToDate === 0) {
      summaryMsg = `Done — ${pl(accounts.length, 'account number')} checked, ${pl(withNew, 'account number')} had new transactions.`;
    } else {
      summaryMsg = `Done — ${pl(accounts.length, 'account number')} checked, ${withNew} had new transactions, ${alreadyUpToDate} already up to date.`;
    }
    await this.log(jobId, summaryMsg, 'bank_sync', 'success');
    // Browser stays open — session reused by next job run
    return result;
  }

  // ─── Step 2: Sheets sync (read DB → push GSheets) ───────────────────────────

  private async runSheetsSync(jobId: string, accountRows: Map<string, TransactionRow[]>): Promise<void> {
    if (accountRows.size === 0) {
      await this.log(jobId, 'No account numbers to sync to GSheets.', 'sheets_sync');
      return;
    }

    let synced = 0;
    let skipped = 0;

    for (const [accountNumber, rows] of accountRows) {
      try {
        const result = await this.sheets.sync(accountNumber, rows);
        if (result.skipped) {
          skipped++;
          const reason = result.reason ?? 'unknown';
          const label = result.accountName ? `${result.accountName} (${accountNumber})` : accountNumber;
          const msg = reason === 'no_gsheet_config'
            ? `no GSheet config for ${result.accountName ?? accountNumber}`
            : reason === 'no_service_key' ? 'no Google service key configured'
            : reason === 'all_duplicates' ? 'all rows already exist (duplicates)'
            : reason;
          await this.log(jobId, `${label}: skipped — ${msg}`, 'sheets_sync', 'warn');
        } else {
          synced++;
          await this.log(jobId, `${accountNumber}: synced ${pl(result.rowsSynced ?? 0, 'row')} to GSheets.`, 'sheets_sync', 'success');
        }
      } catch (err) {
        skipped++;
        const msg = (err as Error).message ?? 'Sheets error';
        await this.log(jobId, `${accountNumber}: GSheets error — ${msg} [${FAIL_REASON.SHEET_ERROR}]`, 'sheets_sync', 'error');
      }
    }

    await this.log(
      jobId,
      `Done — ${pl(synced, 'account number')} synced, ${skipped} skipped.`,
      'sheets_sync',
      synced > 0 ? 'success' : 'warn',
    );
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

      const existing = await this.prisma.bankTransaction.findUnique({
        where: { bankAccountId_dataHash: { bankAccountId, dataHash } },
        select: { id: true },
      });

      if (existing) {
        duplicates++;
        continue;
      }

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
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          duplicates++;
        } else {
          throw err;
        }
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

function pl(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
