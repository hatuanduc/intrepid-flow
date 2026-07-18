import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import Redis from 'ioredis';
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

// Bank entity name per country code — used only when discovery creates a brand-new account.
const BANK_NAME_BY_CODE: Record<string, string> = {
  VN: 'HSBC Vietnam',
  MY: 'HSBC Malaysia',
  ID: 'HSBC Indonesia',
  PH: 'HSBC Philippines',
  SG: 'HSBC Singapore',
};

function bankNameForCode(countryCode: string): string {
  return BANK_NAME_BY_CODE[countryCode] ?? `HSBC ${countryCode}`;
}

@Injectable()
export class BankSyncService {
  private readonly logger = new Logger(BankSyncService.name);
  private readonly prisma = new PrismaClient();
  private readonly redis = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
  });

  constructor(
    private readonly playwright: PlaywrightService,
    private readonly excel: ExcelService,
    private readonly sheets: SheetsService,
  ) {}

  async run(jobId: number): Promise<void> {
    const settings = await this.prisma.bankJobSettings.findUnique({ where: { id: 'default' } });
    if (!settings?.hsbcnetUsername) {
      await this.updateJob(jobId, JOB_STATUS.FAILED, undefined, 'HSBCNET_USERNAME_NOT_CONFIGURED');
      throw new Error('HSBCNET_USERNAME_NOT_CONFIGURED');
    }

    const job = await this.prisma.bankSyncJob.findUnique({ where: { id: jobId } });
    const steps = parseSteps(job?.steps);

    // Reset to the moment the worker actually starts processing — the API only sets
    // startedAt at enqueue time, which can be much earlier than pickup if the job sat
    // waiting in the queue (e.g. worker was offline), inflating the computed duration.
    await this.prisma.bankSyncJob.update({ where: { id: jobId }, data: { startedAt: new Date() } });

    const step1Done = steps.find(s => s.key === 'bank_sync')?.status === 'completed';
    const step2Done = steps.find(s => s.key === 'sheets_sync')?.status === 'completed';

    try {
      // ── Step 1: Fetch bank statement ────────────────────────────────────────
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

      // ── Step 2: Sync to Google Sheets ───────────────────────────────────────
      let sheetsSyncFailed = false;
      let sheetsFailedCount = 0;
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
          const sheetsResult = await this.runSheetsSync(jobId, accountRows);
          sheetsSyncFailed = sheetsResult.failed > 0;
          sheetsFailedCount = sheetsResult.failed;
          await this.updateStep(jobId, 'sheets_sync', {
            status: sheetsSyncFailed ? 'failed' : 'completed',
            completedAt: new Date().toISOString(),
            errorMessage: sheetsSyncFailed ? `${sheetsResult.failed} account(s) failed to sync to Google Sheets` : null,
          });
        }
      }

      if (sheetsSyncFailed) {
        await this.updateJob(jobId, JOB_STATUS.FAILED, undefined, 'GSheets sync failed for one or more accounts');
        await this.log(jobId, 'Job failed — one or more accounts failed to sync to Google Sheets.', undefined, 'error');
        await this.notify(jobId, 'job_failed', 'Đồng bộ sao kê thất bại', `${sheetsFailedCount} tài khoản lỗi khi đồng bộ Google Sheets.`);
        return;
      }

      await this.updateJob(jobId, JOB_STATUS.COMPLETED);
      await this.log(jobId, 'Job completed successfully.', undefined, 'success');
      await this.notify(jobId, 'job_completed', 'Đồng bộ sao kê hoàn tất', `${accountRows.size} tài khoản đã đồng bộ.`);
    } catch (err) {
      // Deliberately NOT closing the browser here. HSBCnet ties session validity to
      // the live tab/connection, not just to the cookie — closing and reopening a
      // "saved" session reliably hits the "already logged on" interstitial and forces
      // a full re-login + 2FA. Leaving the browser open across a failed job lets the
      // next attempt reuse the still-authenticated tab via init()'s reuse check.

      const msg = (err as Error).message ?? 'Unknown error';

      // Mark the currently running step as failed/cancelled
      const current = await this.prisma.bankSyncJob.findUnique({ where: { id: jobId }, select: { status: true, steps: true } });
      const currentSteps = parseSteps(current?.steps);
      const runningStep = currentSteps.find(s => s.status === 'running');

      if (current?.status === JOB_STATUS.CANCELLED || msg === 'JOB_CANCELLED') {
        if (runningStep) {
          await this.updateStep(jobId, runningStep.key, {
            status: 'failed',
            completedAt: new Date().toISOString(),
            errorMessage: 'Cancelled by user',
          });
        }
        return; // Status already set to cancelled by API — don't throw
      }

      if (runningStep) {
        await this.updateStep(jobId, runningStep.key, {
          status: 'failed',
          completedAt: new Date().toISOString(),
          errorMessage: msg,
        });
      }

      await this.updateJob(jobId, JOB_STATUS.FAILED, undefined, msg);
      await this.notify(jobId, 'job_failed', 'Đồng bộ sao kê thất bại', friendlyBankSyncError(msg));
      throw err;
    }
  }

  // ─── Account discovery — scrape HSBCnet switcher, upsert BankAccount rows ───

  private async discoverAndSyncAccounts(jobId: number): Promise<void> {
    const discovered: DiscoveredAccount[] = await this.playwright.discoverAccounts();
    if (discovered.length === 0) {
      await this.log(jobId, 'No accounts discovered from HSBCnet — keeping existing account list.', 'bank_sync', 'warn');
      return;
    }

    // Account names are master data (added manually) — discovery only creates
    // accounts for names that already exist here, never new account names.
    const accountNames = await this.prisma.bankAccountName.findMany({ where: { isActive: true } });
    const accountNameByName = new Map(accountNames.map(a => [a.name.trim().toLowerCase(), a]));

    const existingNumbers = new Set(
      (await this.prisma.bankAccount.findMany({
        where: { accountNumber: { in: discovered.map(a => a.accountNumber) } },
        select: { accountNumber: true },
      })).map(a => a.accountNumber),
    );

    const unmatchedNames = new Set<string>();
    let synced = 0;

    for (const acc of discovered) {
      const accountNameEntry = accountNameByName.get(acc.companyName.trim().toLowerCase());
      if (!accountNameEntry) {
        unmatchedNames.add(acc.companyName);
        continue;
      }

      await this.prisma.bankAccount.upsert({
        where: { accountNumber: acc.accountNumber },
        create: {
          accountNumber: acc.accountNumber,
          accountNameId: accountNameEntry.id,
          accountName: accountNameEntry.name,
          accountCode: accountNameEntry.accountCode,
          currency: acc.currency,
          bankName: bankNameForCode(accountNameEntry.accountCode),
          isActive: true,
        },
        update: {
          accountNameId: accountNameEntry.id,
          accountName: accountNameEntry.name,
          accountCode: accountNameEntry.accountCode,
          currency: acc.currency,
          // HSBC is the source of truth — an account seen again in this run is live
          // again even if we'd previously deactivated it.
          isActive: true,
        },
      });
      synced++;
    }

    // HSBC is the source of truth: any account still marked active in our DB but absent
    // from this discovery run is presumably closed/removed on HSBC's side. Deactivate it
    // so the download loop below (which only fetches isActive accounts) stops trying to
    // look it up every run — a stale account number there just fails loudly with "not
    // found in HSBC's account list" instead of being skipped cleanly.
    const discoveredNumbers = discovered.map(a => a.accountNumber);
    const deactivated = await this.prisma.bankAccount.updateMany({
      where: { isActive: true, accountNumber: { notIn: discoveredNumbers } },
      data: { isActive: false },
    });

    const newCount = discovered.filter(a => !existingNumbers.has(a.accountNumber)).length;
    await this.log(
      jobId,
      `Account discovery: ${discovered.length} found, ${synced} synced (${newCount} new, ${synced - newCount} updated)`
        + (deactivated.count > 0 ? `, ${deactivated.count} deactivated (no longer on HSBC).` : '.'),
      'bank_sync',
      'success',
    );

    if (unmatchedNames.size > 0) {
      await this.log(
        jobId,
        `Skipped ${unmatchedNames.size} unrecognized account name(s) — not in BankAccountName master list: ${Array.from(unmatchedNames).join(', ')}`,
        'bank_sync',
        'warn',
      );
    }
  }

  // ─── Step 1: Bank sync (login → discover → download → parse → store) ────────

  private async runBankSync(jobId: number): Promise<Map<string, TransactionRow[]>> {
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
      await this.notify(jobId, 'job_waiting_2fa', 'HSBCnet cần xác nhận đăng nhập', 'Mở app HSBCnet trên điện thoại để xác nhận đăng nhập.');
      await this.playwright.wait2FA();
      await this.log(jobId, '2FA confirmed.', 'bank_sync', 'success');
      await this.playwright.saveSession();
      await this.log(jobId, 'Session saved for reuse.', 'bank_sync', 'success');
    } else {
      await this.log(jobId, 'Session still valid — skipping authentication.', 'bank_sync', 'success');
    }

    await this.updateJob(jobId, JOB_STATUS.AUTHENTICATED);
    await this.log(jobId, 'Authenticated successfully.', 'bank_sync', 'success');

    // ── 1b. Discover accounts from HSBCnet switcher → upsert BankAccount ─────
    await this.updateJob(jobId, JOB_STATUS.DISCOVERING_ACCOUNTS);
    await this.discoverAndSyncAccounts(jobId);

    // ── 1c. Compute date range — per-run override takes priority over settings ──
    // A manual "Run now" can supply an explicit dateFrom/dateTo (stored on this job
    // row only, never written back to BankJobSettings) — scheduled cron runs never
    // set these, so they always fall through to the default syncDateMode/syncCustomDays.
    const job = await this.prisma.bankSyncJob.findUnique({
      where: { id: jobId },
      select: { dateFromOverride: true, dateToOverride: true },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anySettings = settings as any;
    const dateMode: string = anySettings?.syncDateMode ?? 'yesterday';
    const customDays: number = anySettings?.syncCustomDays ?? 1;
    const hasOverride = !!(job?.dateFromOverride && job?.dateToOverride);
    const { from: dateFrom, to: dateTo } = hasOverride
      ? { from: job!.dateFromOverride!, to: job!.dateToOverride! }
      : computeDateRange(dateMode, customDays);
    const rangeLabel = `${formatDateLabel(dateFrom)} → ${formatDateLabel(dateTo)}`;
    await this.log(jobId, `Date range: ${rangeLabel} (${hasOverride ? 'ghi đè thủ công' : `mode: ${dateMode}`}).`, 'bank_sync');
    // Persist the resolved range (not just the override, which is null on non-override
    // runs) so the UI can show it directly instead of parsing the log line.
    await this.prisma.bankSyncJob.update({
      where: { id: jobId },
      data: { dateRangeFrom: dateFrom, dateRangeTo: dateTo },
    });

    // "Already synced, skip" only makes sense for a range that's fully settled —
    // if dateTo reaches today (mode 'today', or a manual override ending today),
    // that day's data can still change through the day, so it must always be
    // re-checked no matter what lastSyncedTo says.
    const nowForSettledCheck = new Date();
    const todayUtc = new Date(Date.UTC(nowForSettledCheck.getUTCFullYear(), nowForSettledCheck.getUTCMonth(), nowForSettledCheck.getUTCDate()));
    const dateRangeSettled = dateTo.getTime() < todayUtc.getTime();

    // ── 1d. Download per active account (grouped by accountName) ─────────────
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
        if (await this.isJobCancelled(jobId)) {
          await this.log(jobId, 'Job cancelled by user.', 'bank_sync', 'warn');
          throw new Error('JOB_CANCELLED');
        }

        // HSBC data for this range is already settled and previously confirmed —
        // dateRangeSettled rules out 'today' mode (or a manual override reaching
        // today), where the same day's data can still change — so a stored
        // lastSyncedTo covering it means nothing has or will change. Skip re-driving
        // the whole Playwright flow (account switch, date filter, export) for nothing.
        //
        // lastSyncedTo is a per-account field, not scoped to this job — it can get
        // set by a DIFFERENT job's success (e.g. a later scheduled run) after THIS
        // job's own row for this account was left 'failed' from an earlier attempt.
        // Without upserting here, this job's own stats would show that stale
        // 'failed' status forever, even though the account is confirmed fine —
        // explicitly mark it "completed, already up to date" for this job's record.
        if (dateRangeSettled && account.lastSyncedTo && account.lastSyncedTo.getTime() >= dateTo.getTime()) {
          await this.log(jobId, `  → ${account.accountNumber}: already synced through ${formatDateLabel(account.lastSyncedTo)}, skipping.`, 'bank_sync');
          await this.upsertJobAccount(jobId, account.id, { status: 'completed', sheetsSyncStatus: 'no_data' });
          continue;
        }

        await this.log(jobId, `  → Fetching ${account.accountNumber}...`, 'bank_sync');

        let excelBuffer: Buffer | null;
        try {
          // Passing isJobCancelled lets downloadStatement() notice a cancellation
          // *during* its own multi-step flow (30-60+s across account switch, date
          // filter, export) instead of only ever being checked between accounts —
          // previously a cancel mid-account meant waiting for that whole account to
          // finish (and often several more after it) before it took effect.
          excelBuffer = await this.playwright.downloadStatement(
            account.accountNumber, dateFrom, dateTo, () => this.isJobCancelled(jobId),
          );
        } catch (err) {
          const msg = (err as Error).message ?? 'Download error';
          if (msg === 'JOB_CANCELLED') {
            await this.log(jobId, 'Job cancelled by user.', 'bank_sync', 'warn');
            throw err; // propagate — this must stop the whole job, not just this account
          }
          await this.log(jobId, `  → ${account.accountNumber}: fetch failed — ${msg} [${FAIL_REASON.DOWNLOAD_ERROR}]`, 'bank_sync', 'error');
          await this.upsertJobAccount(jobId, account.id, { status: 'failed', errorMessage: msg });
          continue;
        }

        if (excelBuffer === null) {
          await this.log(jobId, `  → ${account.accountNumber}: no transactions in range.`, 'bank_sync');
          await this.upsertJobAccount(jobId, account.id, { status: 'completed', sheetsSyncStatus: 'no_data' });
          await this.markSyncedThrough(account.id, dateTo);
          continue;
        }

        await this.log(jobId, `  → ${account.accountNumber}: Excel statement fetched.`, 'bank_sync', 'success');

        await this.updateJob(jobId, JOB_STATUS.STORING);
        const { rows, validation } = await this.excel.parse(excelBuffer);
        await this.log(jobId, `  → ${account.accountNumber}: parsed ${pl(rows.length, 'transaction row')}.`, 'bank_sync');

        if (!validation.valid) {
          const msg = `Missing required columns — ${validation.missingRequired.join(', ')}`;
          await this.log(jobId, `  → ${account.accountNumber}: ${msg} [${FAIL_REASON.MISSING_REQUIRED_COLUMNS}]`, 'bank_sync', 'error');
          await this.upsertJobAccount(jobId, account.id, { status: 'failed', errorMessage: msg, rowsDownloaded: rows.length });
          continue;
        }
        if (validation.missingOptional.length > 0) {
          await this.log(jobId, `  → ${account.accountNumber}: missing optional columns — ${validation.missingOptional.join(', ')}`, 'bank_sync', 'warn');
        }

        if (rows.length === 0) {
          await this.upsertJobAccount(jobId, account.id, { status: 'completed', rowsDownloaded: 0, sheetsSyncStatus: 'no_data' });
          await this.markSyncedThrough(account.id, dateTo);
          continue;
        }

        const { inserted, duplicates } = await this.storeTransactions(jobId, account.id, account.accountNumber, rows);
        await this.log(jobId, `  → ${account.accountNumber}: stored — ${inserted} new, ${pl(duplicates, 'duplicate')}.`, 'bank_sync', inserted > 0 ? 'success' : 'warn');
        await this.upsertJobAccount(jobId, account.id, {
          status: 'completed',
          rowsDownloaded: rows.length,
          rowsInserted: inserted,
          rowsDuplicate: duplicates,
        });
        await this.markSyncedThrough(account.id, dateTo);

        // Include the account even with 0 new rows if it has never been synced to
        // GSheets successfully — otherwise a fixed config/retry would never get a
        // chance to push already-downloaded data that previously failed to sync.
        const everSynced = await this.prisma.bankSyncJobAccount.findFirst({
          where: { bankAccountId: account.id, sheetsSyncStatus: 'completed' },
          select: { id: true },
        });

        if (inserted > 0 || !everSynced) {
          result.set(account.accountNumber, rows);
          withNew++;
        } else {
          alreadyUpToDate++;
          await this.upsertJobAccount(jobId, account.id, { sheetsSyncStatus: 'no_data' });
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

  private async runSheetsSync(
    jobId: number,
    accountRows: Map<string, TransactionRow[]>,
  ): Promise<{ synced: number; skipped: number; failed: number }> {
    if (accountRows.size === 0) {
      await this.log(jobId, 'No account numbers to sync to GSheets.', 'sheets_sync');
      return { synced: 0, skipped: 0, failed: 0 };
    }

    const bankAccounts = await this.prisma.bankAccount.findMany({
      where: { accountNumber: { in: Array.from(accountRows.keys()) } },
      select: { id: true, accountNumber: true, accountName: true },
    });
    const bankAccountIdByNumber = new Map(bankAccounts.map(a => [a.accountNumber, a.id]));
    const accountNameByNumber = new Map(bankAccounts.map(a => [a.accountNumber, a.accountName]));

    // Accounts already synced successfully earlier in this same job (e.g. before a
    // retry) — skip re-uploading them, only the still-unsynced ones get attempted.
    const alreadySyncedIds = new Set(
      (await this.prisma.bankSyncJobAccount.findMany({
        where: { jobId, sheetsSyncStatus: 'completed' },
        select: { bankAccountId: true },
      })).map(a => a.bankAccountId),
    );

    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const [accountNumber, rows] of accountRows) {
      const bankAccountId = bankAccountIdByNumber.get(accountNumber);
      const accountName = accountNameByNumber.get(accountNumber);
      const label = accountName ? `${accountName} (${accountNumber})` : accountNumber;

      if (bankAccountId && alreadySyncedIds.has(bankAccountId)) {
        synced++;
        await this.log(jobId, `${label}: synced in a previous attempt — no action needed.`, 'sheets_sync');
        continue;
      }

      try {
        const result = await this.sheets.sync(accountNumber, rows);
        if (result.skipped) {
          skipped++;
          const reason = result.reason ?? 'unknown';
          const msg = reason === 'no_gsheet_config'
            ? `no GSheet config for ${accountName ?? accountNumber}`
            : reason === 'no_service_key' ? 'no Google service key configured'
            : reason === 'all_duplicates' ? 'all rows already exist (duplicates)'
            : reason;
          await this.log(jobId, `${label}: skipped — ${msg}`, 'sheets_sync', 'warn');
          if (bankAccountId) {
            await this.upsertJobAccount(jobId, bankAccountId, { sheetsSyncStatus: 'skipped', sheetsSyncError: msg });
          }
        } else {
          synced++;
          await this.log(jobId, `${label}: synced ${pl(result.rowsSynced ?? 0, 'row')} to GSheets.`, 'sheets_sync', 'success');
          if (bankAccountId) {
            await this.upsertJobAccount(jobId, bankAccountId, {
              sheetsSyncStatus: 'completed',
              rowsSynced: result.rowsSynced ?? 0,
              sheetsSyncError: null,
            });
          }
        }
      } catch (err) {
        failed++;
        const msg = (err as Error).message ?? 'Sheets error';
        await this.log(jobId, `${label}: GSheets error — ${msg} [${FAIL_REASON.SHEET_ERROR}]`, 'sheets_sync', 'error');
        if (bankAccountId) {
          await this.upsertJobAccount(jobId, bankAccountId, { sheetsSyncStatus: 'failed', sheetsSyncError: msg });
        }
      }
    }

    await this.log(
      jobId,
      `Done — ${synced} synced, ${skipped} skipped, ${failed} failed.`,
      'sheets_sync',
      failed > 0 ? 'error' : (synced > 0 ? 'success' : 'warn'),
    );

    return { synced, skipped, failed };
  }

  // ─── Load existing transactions from DB (for step2 retry) ───────────────────

  private async loadTransactionsForJob(jobId: number): Promise<Map<string, TransactionRow[]>> {
    const jobAccounts = await this.prisma.bankSyncJobAccount.findMany({
      where: { jobId, status: 'completed' },
      select: { bankAccountId: true },
    });
    if (jobAccounts.length === 0) return new Map();

    // This job's own newly-inserted rows.
    const ownTxns = await this.prisma.bankTransaction.findMany({
      where: { jobId },
      include: { bankAccount: { select: { accountNumber: true } } },
    });
    const idsWithOwnRows = new Set(ownTxns.map(t => t.bankAccountId));

    // Accounts with nothing new from this job but never successfully synced —
    // pull their full stored history so a fixed config/retry can still push it
    // (duplicate rows stay linked to whichever job first inserted them, so a
    // later job that only re-checked the bank has no rows of its own for them).
    const candidateIds = jobAccounts
      .map(a => a.bankAccountId)
      .filter(id => !idsWithOwnRows.has(id));
    const neverSyncedIds: number[] = [];
    for (const id of candidateIds) {
      const synced = await this.prisma.bankSyncJobAccount.findFirst({
        where: { bankAccountId: id, sheetsSyncStatus: 'completed' },
        select: { id: true },
      });
      if (!synced) neverSyncedIds.push(id);
    }

    const historicalTxns = neverSyncedIds.length > 0
      ? await this.prisma.bankTransaction.findMany({
          where: { bankAccountId: { in: neverSyncedIds } },
          include: { bankAccount: { select: { accountNumber: true } } },
        })
      : [];

    const result = new Map<string, TransactionRow[]>();
    for (const txn of [...ownTxns, ...historicalTxns]) {
      const acc = txn.bankAccount.accountNumber;
      if (!result.has(acc)) result.set(acc, []);
      result.get(acc)!.push({
        postDate: txn.postDate,
        narrative: txn.narrative,
        bankReference: txn.bankReference,
        customerReference: txn.customerReference,
        trnType: txn.trnType,
        creditAmount: txn.creditAmount != null ? Number(txn.creditAmount) : null,
        debitAmount: txn.debitAmount != null ? Number(txn.debitAmount) : null,
        balance: txn.balance != null ? Number(txn.balance) : null,
        dataHash: txn.dataHash,
        rawData: txn.rawData as Record<string, unknown>,
      });
    }
    return result;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  // Per-account progress within a job — powers the job summary stats and lets a
  // retry skip accounts that already finished (download or sheets-sync) successfully.
  private async upsertJobAccount(
    jobId: number,
    bankAccountId: number,
    data: Partial<{
      status: string;
      errorMessage: string | null;
      rowsDownloaded: number;
      rowsInserted: number;
      rowsDuplicate: number;
      rowsSynced: number;
      sheetsSyncStatus: string;
      sheetsSyncError: string | null;
    }>,
  ): Promise<void> {
    await this.prisma.bankSyncJobAccount.upsert({
      where: { jobId_bankAccountId: { jobId, bankAccountId } },
      create: { jobId, bankAccountId, ...data },
      update: data,
    });
  }

  private async storeTransactions(
    jobId: number,
    bankAccountId: number,
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
            rawData: row.rawData as Prisma.InputJsonValue,
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

  private async updateStep(jobId: number, stepKey: StepKey, updates: Partial<JobStep>) {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { id: jobId }, select: { steps: true } });
    const steps = parseSteps(job?.steps);
    const idx = steps.findIndex(s => s.key === stepKey);
    if (idx >= 0) Object.assign(steps[idx], updates);
    await this.prisma.bankSyncJob.update({ where: { id: jobId }, data: { steps } });
  }

  private async updateJob(jobId: number, status: string, message?: string, errorMessage?: string | null) {
    const isTerminal = status === JOB_STATUS.COMPLETED || status === JOB_STATUS.FAILED;
    let terminalData: Record<string, unknown> = {};
    if (isTerminal) {
      // Duration accumulates across retries — startedAt resets on each retry,
      // so only this attempt's elapsed time gets added to the running total.
      const current = await this.prisma.bankSyncJob.findUnique({ where: { id: jobId }, select: { startedAt: true } });
      const now = new Date();
      const attemptMs = current?.startedAt ? now.getTime() - current.startedAt.getTime() : 0;
      terminalData = { completedAt: now, durationMsTotal: { increment: attemptMs } };
    }

    await this.prisma.bankSyncJob.update({
      where: { id: jobId },
      data: {
        status,
        ...(errorMessage !== undefined ? { errorMessage } : {}),
        ...terminalData,
      },
    });
    if (message) await this.log(jobId, message);
    this.logger.log(`[${jobId}] → ${status}`);
  }

  private async isJobCancelled(jobId: number): Promise<boolean> {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { id: jobId }, select: { status: true } });
    return job?.status === JOB_STATUS.CANCELLED;
  }

  // Only called after a confirmed-complete fetch (data stored, or genuinely no
  // transactions in range) — never on a download/validation failure, since we don't
  // want a future run to skip a range we never actually got a confirmed result for.
  private async markSyncedThrough(accountId: number, to: Date): Promise<void> {
    await this.prisma.bankAccount.update({ where: { id: accountId }, data: { lastSyncedTo: to } });
  }

  private async log(
    jobId: number,
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

  // Notifies the user who triggered/retried this job — no-op for unattended cron runs
  // (triggeredBy is the literal 'cron', not a user id), since there's no one to show
  // a bell notification to.
  private async notify(jobId: number, type: string, title: string, body?: string) {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { id: jobId }, select: { triggeredBy: true, publicId: true } });
    if (!job?.triggeredBy || job.triggeredBy === 'cron') return;

    const userId = Number(job.triggeredBy);
    if (!Number.isFinite(userId)) return;
    const notification = await this.prisma.notification.create({
      data: { userId, type, title, body: body ?? null, jobPublicId: job.publicId },
    });
    await this.redis.publish('notifications', JSON.stringify({ userId, notification }));
  }
}

// Mirrors BankJobDetailPage.tsx's FRIENDLY_ERROR_KEYS/friendlyError — raw Playwright/HSBCnet
// error text (stack-trace-like "page.goto: Target page..." or "Timeout 30000ms exceeded. Call
// log: ...") is not something a non-technical user can act on. The raw message is still kept in
// BankSyncJob/step errorMessage for the job detail page's "show raw" toggle — this mapping only
// affects what gets pushed to the notification bell.
const FRIENDLY_ERROR_PATTERNS: Array<[RegExp, string]> = [
  [/INVALID_USERNAME/i,                 'Tên đăng nhập HSBCnet không đúng. Vui lòng kiểm tra lại trong Cài đặt → Kết nối.'],
  [/HSBCNET_USERNAME.*not configured/i, 'Chưa cấu hình tên đăng nhập HSBCnet. Vào Cài đặt → Kết nối để cập nhật.'],
  [/TIMEOUT_2FA/i,                      'Hết thời gian chờ xác thực — không nhận được phê duyệt từ ứng dụng di động HSBCnet.'],
  [/Timeout.*exceeded/i,                'Hết thời gian chờ — trang web ngân hàng phản hồi quá chậm hoặc không tải được đúng hạn.'],
  [/page\.(fill|click|goto)/i,          'Không tương tác được với trang web ngân hàng — giao diện có thể đã thay đổi.'],
  [/locator\(/i,                        'Không tìm thấy phần tử trên trang — giao diện ngân hàng có thể đã cập nhật.'],
  [/net::ERR_/i,                        'Lỗi kết nối mạng — không thể truy cập trang web ngân hàng.'],
  [/2fa|mobile.*app|approval/i,         'Xác thực 2 bước thất bại hoặc hết thời gian chờ phê duyệt trên ứng dụng di động.'],
  [/download|csv|xlsx/i,                'Lỗi tải xuống file sao kê — trang web ngân hàng không trả về đúng định dạng.'],
  [/context or browser has been closed/i, 'Phiên làm việc với ngân hàng đã bị đóng giữa chừng. Vui lòng thử lại.'],
  [/LOGIN_FORM_NOT_FOUND|Service Unavailable/i, 'Trang đăng nhập HSBCnet báo "Service Unavailable" — có thể ngân hàng đang tạm chặn/bảo trì. Vui lòng thử lại sau vài phút.'],
];

function friendlyBankSyncError(raw: string): string {
  for (const [pattern, message] of FRIENDLY_ERROR_PATTERNS) {
    if (pattern.test(raw)) return message;
  }
  return 'Đồng bộ thất bại. Vui lòng kiểm tra log chi tiết và thử lại.';
}

function formatDateLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function pl(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
