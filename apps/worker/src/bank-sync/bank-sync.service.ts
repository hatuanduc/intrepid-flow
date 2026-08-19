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
    // Account names are master data (added manually) — discovery only creates
    // accounts for names that already exist here, never new account names. Fetched
    // up front (not after discovery) because discoverAccounts() now searches the
    // HSBC switcher once per name instead of reading it unfiltered — the switcher's
    // own list is capped at a fixed page size, so an unfiltered read used to silently
    // drop any account past that cutoff (a company with 3 real accounts could come
    // back with just 1). Searching per-name keeps every result set well under that cap.
    const accountNames = await this.prisma.bankAccountName.findMany({ where: { isActive: true } });
    const accountNameByName = new Map(accountNames.map(a => [a.name.trim().toLowerCase(), a]));

    const discovered: DiscoveredAccount[] = await this.playwright.discoverAccounts(accountNames.map(a => a.name));
    if (discovered.length === 0) {
      await this.log(jobId, 'No accounts discovered from HSBCnet — keeping existing account list.', 'bank_sync', 'warn');
      return;
    }

    const existingNumbers = new Set(
      (await this.prisma.bankAccount.findMany({
        where: { accountNumber: { in: discovered.map(a => a.accountNumber) } },
        select: { accountNumber: true },
      })).map(a => a.accountNumber),
    );

    const unmatchedNames = new Set<string>();
    const matchedNameKeys = new Set<string>();
    let synced = 0;

    for (const acc of discovered) {
      const nameKey = acc.companyName.trim().toLowerCase();
      const accountNameEntry = accountNameByName.get(nameKey);
      if (!accountNameEntry) {
        unmatchedNames.add(acc.companyName);
        continue;
      }
      matchedNameKeys.add(nameKey);

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

    // Discovery only ever creates/reactivates accounts (upsert above) — it never
    // deactivates. HSBC's switcher not showing an account on a given day's scrape
    // doesn't mean the account is closed (banks routinely omit accounts from a day's
    // listing), so an account absent here just isn't touched — it stays exactly as
    // it was. Whether it actually gets fetched is entirely down to its own
    // syncEnabled toggle; if HSBC genuinely doesn't have it when the fetch loop tries
    // it, that surfaces as a clear per-account failure there instead of a silent,
    // permanent drop from every future run.
    const newCount = discovered.filter(a => !existingNumbers.has(a.accountNumber)).length;
    await this.log(
      jobId,
      `Account discovery: ${discovered.length} found, ${synced} synced (${newCount} new, ${synced - newCount} updated).`,
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

    // The reverse direction — an enabled master name that this HSBC scan never showed
    // at all. Previously only the HSBC→local direction was logged (unmatchedNames
    // above), so a typo/renamed company on either side was silent from this side —
    // you'd only ever see "HSBC has some unrecognized name", never "your enabled
    // local name X wasn't seen in HSBC this run", making the two hard to correlate.
    const notFoundInHsbc = accountNames.filter(a => !matchedNameKeys.has(a.name.trim().toLowerCase()));
    if (notFoundInHsbc.length > 0) {
      await this.log(
        jobId,
        `${pl(notFoundInHsbc.length, 'enabled account name')} not found in this HSBC discovery: ${notFoundInHsbc.map(a => a.name).join(', ')}`,
        'bank_sync',
        'warn',
      );
    }
  }

  // ─── Step 1: Bank sync (login → discover → download → parse → store) ────────

  private async runBankSync(jobId: number): Promise<Map<string, TransactionRow[]>> {
    const result = new Map<string, TransactionRow[]>();

    const settings = await this.prisma.bankJobSettings.findUnique({ where: { id: 'default' } });

    // ── 1a. Compute date range up front — pure DB/date math, no HSBC login needed —
    // so the "already synced, skip everything" check below can run before ever
    // touching Playwright/2FA. Per-run override takes priority over settings: a
    // manual "Run now" can supply an explicit dateFrom/dateTo (stored on this job
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

    // ── 1b. Bail out before ever opening a browser if every known account already
    // covers this range — avoids a pointless login/2FA round-trip for a job that's
    // going to skip every account anyway. Uses whatever accounts are already in DB
    // (no live HSBCnet discovery). But a master account name with zero BankAccount
    // rows yet (e.g. just added to the seed, never actually discovered on HSBCnet)
    // is invisible to that check — so also bail-in whenever one exists, forcing a
    // real login+discovery pass instead of silently never picking the new name up.
    // syncEnabled=false / accountNameRef.isActive=false accounts are user-disabled
    // (e.g. testing with only a subset) — excluded from both the coverage check and
    // the actual fetch loop below, same filter in both places. isActive is deliberately
    // NOT part of this filter — it's discovery-owned metadata, not a fetch gate; the
    // only thing that stops an account from being fetched is its own syncEnabled toggle.
    const knownAccounts = await this.prisma.bankAccount.findMany({
      where: { syncEnabled: true, accountNameRef: { isActive: true } },
    });

    // Log disabled accounts explicitly — otherwise a syncEnabled=false account just
    // vanishes from every query above with no trace, indistinguishable from having
    // never existed. Logged once up front (before either the bail-out or the full
    // login+fetch path below) so it's visible no matter which path this run takes.
    const disabledAccounts = await this.prisma.bankAccount.findMany({
      where: { syncEnabled: false, accountNameRef: { isActive: true } },
      orderBy: [{ accountName: 'asc' }, { accountNumber: 'asc' }],
    });
    if (disabledAccounts.length > 0) {
      await this.log(
        jobId,
        `${pl(disabledAccounts.length, 'account number')} excluded — sync disabled: `
          + disabledAccounts.map(a => `${a.accountNumber} (${a.accountName})`).join(', ') + '.',
        'bank_sync',
        'warn',
      );
    }

    const undiscoveredNameCount = await this.prisma.bankAccountName.count({
      where: { isActive: true, accounts: { none: {} } },
    });
    const allAlreadyCovered = dateRangeSettled && knownAccounts.length > 0 && undiscoveredNameCount === 0 && knownAccounts.every(a =>
      a.lastSyncedFrom && a.lastSyncedTo &&
      dateFrom.getTime() >= a.lastSyncedFrom.getTime() &&
      dateTo.getTime() <= a.lastSyncedTo.getTime(),
    );
    if (allAlreadyCovered) {
      await this.log(jobId, `All ${pl(knownAccounts.length, 'account number')} already synced ${rangeLabel} — skipping HSBC login entirely.`, 'bank_sync', 'success');
      for (const account of knownAccounts) {
        // Same per-account detail (existing count + log line) as the in-loop skip path
        // below — otherwise this early-exit path silently reports "0 transactions" for
        // everything, hiding how much data is actually already on file.
        const existingCount = await this.prisma.bankTransaction.count({
          where: { bankAccountId: account.id, postDate: { gte: dateFrom, lte: dateTo } },
        });
        await this.log(jobId, `  → ${account.accountNumber}: already synced ${formatDateLabel(account.lastSyncedFrom!)} → ${formatDateLabel(account.lastSyncedTo!)} (${pl(existingCount, 'transaction')} on file), skipping.`, 'bank_sync');
        await this.upsertJobAccount(jobId, account.id, {
          status: 'completed',
          sheetsSyncStatus: 'no_data',
          rowsDownloaded: existingCount,
          rowsInserted: 0,
          rowsDuplicate: existingCount,
        });
        await this.registerJobOwnership(jobId, account.id, dateFrom, dateTo);
      }
      return result;
    }

    // ── 1c. Browser + auth ────────────────────────────────────────────────────
    await this.playwright.init();
    await this.log(jobId, 'Browser ready — checking session...', 'bank_sync');
    await this.updateJob(jobId, JOB_STATUS.CHECKING_SESSION);

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
      await this.playwright.wait2FA(() => this.isJobCancelled(jobId));
      await this.log(jobId, '2FA confirmed.', 'bank_sync', 'success');
      await this.playwright.saveSession();
      await this.log(jobId, 'Session saved for reuse.', 'bank_sync', 'success');
    } else {
      await this.log(jobId, 'Session still valid — skipping authentication.', 'bank_sync', 'success');
    }

    await this.updateJob(jobId, JOB_STATUS.AUTHENTICATED);
    await this.log(jobId, 'Authenticated successfully.', 'bank_sync', 'success');

    // ── 1d. Discover accounts from HSBCnet switcher → upsert BankAccount ─────
    await this.updateJob(jobId, JOB_STATUS.DISCOVERING_ACCOUNTS);
    await this.discoverAndSyncAccounts(jobId);

    // ── 1e. Download per sync-enabled account (grouped by accountName) — every account
    // declared in the DB with syncEnabled=true is attempted every run, regardless of
    // isActive; an account HSBC doesn't have today just fails per-account below instead
    // of being silently excluded from this list.
    const accounts = await this.prisma.bankAccount.findMany({
      where: { syncEnabled: true, accountNameRef: { isActive: true } },
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
        // today), where the same day's data can still change. Skip re-driving the
        // whole Playwright flow (account switch, date filter, export) only when the
        // REQUESTED RANGE IS FULLY WITHIN what was actually fetched last time — both
        // bounds matter. Checking lastSyncedTo alone (ignoring dateFrom) would wrongly
        // skip a WIDER range whose earlier start was never actually fetched (e.g. a
        // single-day "yesterday" job followed later by a "last 7 days" job) — a real
        // gap that then never gets filled in. lastSyncedFrom/To are overwritten (not
        // merged/accumulated) after each real fetch, so this is a safe subset check —
        // worst case a disconnected range re-fetches a bit more than strictly needed,
        // never wrongly skips something never confirmed.
        //
        // lastSyncedTo is a per-account field, not scoped to this job — it can get
        // set by a DIFFERENT job's success (e.g. a later scheduled run) after THIS
        // job's own row for this account was left 'failed' from an earlier attempt.
        // Without upserting here, this job's own stats would show that stale
        // 'failed' status forever, even though the account is confirmed fine —
        // explicitly mark it "completed, already up to date" for this job's record.
        const rangeAlreadyCovered =
          account.lastSyncedFrom && account.lastSyncedTo &&
          dateFrom.getTime() >= account.lastSyncedFrom.getTime() &&
          dateTo.getTime() <= account.lastSyncedTo.getTime();
        if (dateRangeSettled && rangeAlreadyCovered) {
          // Count what's already on file for this range so the log/summary can show it —
          // otherwise a skip looks identical whether the account has 0 or 200 transactions.
          const existingCount = await this.prisma.bankTransaction.count({
            where: { bankAccountId: account.id, postDate: { gte: dateFrom, lte: dateTo } },
          });
          await this.log(jobId, `  → ${account.accountNumber}: already synced ${formatDateLabel(account.lastSyncedFrom!)} → ${formatDateLabel(account.lastSyncedTo!)} (${pl(existingCount, 'transaction')} on file), skipping.`, 'bank_sync');
          await this.upsertJobAccount(jobId, account.id, {
            status: 'completed',
            sheetsSyncStatus: 'no_data',
            rowsDownloaded: existingCount,
            rowsInserted: 0,
            rowsDuplicate: existingCount,
          });
          // This job never fetches/compares anything on the skip path, so it would
          // otherwise never register itself in jobIds (see storeTransactions) — leaving
          // it unable to Force Resync this range's rows later if the job that originally
          // fetched them ever gets deleted. Claim co-ownership of them now instead.
          await this.registerJobOwnership(jobId, account.id, dateFrom, dateTo);
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
          // HSBC genuinely not listing this account today isn't a fetch failure — it's
          // an expected, unremarkable outcome now that discovery no longer deactivates
          // accounts on our side (an account can be enabled here but absent from HSBC's
          // switcher on any given day). Report it as "no data" like any other empty
          // range, not as an error, so it doesn't read as something needing action.
          if (/not found in HSBC's account list/.test(msg)) {
            await this.log(jobId, `  → ${account.accountNumber}: not listed on HSBC today — no data.`, 'bank_sync', 'warn');
            await this.upsertJobAccount(jobId, account.id, { status: 'completed', sheetsSyncStatus: 'no_data' });
            continue;
          }
          await this.log(jobId, `  → ${account.accountNumber}: fetch failed — ${msg} [${FAIL_REASON.DOWNLOAD_ERROR}]`, 'bank_sync', 'error');
          await this.upsertJobAccount(jobId, account.id, { status: 'failed', errorMessage: msg });
          continue;
        }

        if (excelBuffer === null) {
          await this.log(jobId, `  → ${account.accountNumber}: no transactions in range.`, 'bank_sync');
          await this.upsertJobAccount(jobId, account.id, { status: 'completed', sheetsSyncStatus: 'no_data' });
          if (dateRangeSettled) await this.markSyncedThrough(account.id, dateFrom, dateTo);
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
          if (dateRangeSettled) await this.markSyncedThrough(account.id, dateFrom, dateTo);
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
        if (dateRangeSettled) await this.markSyncedThrough(account.id, dateFrom, dateTo);

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

    // This job's own newly-inserted rows. orderBy is cosmetic — sheets.service.ts
    // re-sorts by (postDate, id) itself before writing, since `id` alone isn't a
    // reliable stand-in for calendar order once multiple jobs/re-fetches are involved.
    // id DESC (not ASC) breaks same-day ties — see sheets.service.ts for why.
    const ownTxns = await this.prisma.bankTransaction.findMany({
      where: { jobId },
      include: { bankAccount: { select: { accountNumber: true } } },
      orderBy: [{ postDate: 'asc' }, { id: 'desc' }],
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
          orderBy: [{ postDate: 'asc' }, { id: 'desc' }],
        })
      : [];

    const result = new Map<string, TransactionRow[]>();
    for (const txn of [...ownTxns, ...historicalTxns]) {
      const acc = txn.bankAccount.accountNumber;
      if (!result.has(acc)) result.set(acc, []);
      result.get(acc)!.push({
        id: txn.id,
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

  // Claims co-ownership (jobIds) of every already-stored row in [dateFrom, dateTo] for this
  // account, without re-fetching/comparing anything — used on the "already synced, skipping"
  // path (see rangeAlreadyCovered above), which otherwise never touches bank_transactions at
  // all and so would never let this job Force Resync that range later.
  private async registerJobOwnership(jobId: number, bankAccountId: number, dateFrom: Date, dateTo: Date): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE bank_transactions
      SET job_ids = array_append(job_ids, ${jobId})
      WHERE bank_account_id = ${bankAccountId}
        AND post_date >= ${dateFrom}
        AND post_date <= ${dateTo}
        AND NOT (${jobId} = ANY(job_ids))
    `;
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
        select: { id: true, jobIds: true },
      });

      if (existing) {
        duplicates++;
        // Register this job as another owner of the row so it can still be force-resynced
        // from here later, even if the row's original inserting job gets deleted.
        if (!existing.jobIds.includes(jobId)) {
          await this.prisma.bankTransaction.update({
            where: { id: existing.id },
            data: { jobIds: { push: jobId } },
          });
        }
        continue;
      }

      try {
        await this.prisma.bankTransaction.create({
          data: {
            bankAccountId,
            jobId,
            jobIds: [jobId],
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
  // transactions in range), and only by callers that already checked dateRangeSettled —
  // never on a download/validation failure, and never for a range still containing
  // today (mode 'today' or an override reaching today), since that day's data can keep
  // changing until it's over. Recording it anyway would make tomorrow's "already synced,
  // skip" check (see dateRangeSettled above) trust a fetch that was only ever provisional.
  private async markSyncedThrough(accountId: number, from: Date, to: Date): Promise<void> {
    await this.prisma.bankAccount.update({ where: { id: accountId }, data: { lastSyncedFrom: from, lastSyncedTo: to } });
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

  // Manual repair path: the normal sync (`run`) only re-pushes to Sheets when a fresh
  // HSBC download inserted new DB rows — an account that's ever synced successfully
  // once gets permanently skipped after that unless new transactions show up (see
  // `withNew`/`everSynced` above). If a user deletes rows/the whole sheet, there's no
  // "new" DB row to trigger a re-push, so it silently never gets repaired. This bypasses
  // that gate entirely and re-sends this job's rows for the account — scoped to rows this
  // job has ever seen (jobIds, not just the original inserting jobId) so a job can still
  // manage/re-push data it matched as a duplicate even after the original job is deleted.
  async forceResyncSheets(bankAccountId: number, jobId: number): Promise<{ accountNumber: string; rowsSynced: number; skipped: boolean; reason?: string }> {
    const account = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!account) throw new Error('BANK_ACCOUNT_NOT_FOUND');
    const label = `${account.accountName} (${account.accountNumber})`;

    try {
      // orderBy is cosmetic — sheets.service.ts re-sorts by (postDate, id) itself,
      // since rows here can span multiple jobs/re-fetches with no guaranteed relation
      // between insertion order and calendar order (e.g. a later job backfilling an
      // earlier date range, or the same day re-fetched as new same-day rows appear).
      // id DESC (not ASC) breaks same-day ties — see sheets.service.ts for why.
      const dbRows = await this.prisma.bankTransaction.findMany({
        where: { bankAccountId, jobIds: { has: jobId } },
        orderBy: [{ postDate: 'asc' }, { id: 'desc' }],
      });

      const rows: TransactionRow[] = dbRows.map(r => ({
        id: r.id,
        postDate: r.postDate,
        narrative: r.narrative,
        bankReference: r.bankReference,
        customerReference: r.customerReference,
        trnType: r.trnType,
        creditAmount: r.creditAmount ? Number(r.creditAmount) : null,
        debitAmount: r.debitAmount ? Number(r.debitAmount) : null,
        balance: r.balance ? Number(r.balance) : null,
        dataHash: r.dataHash,
        rawData: r.rawData as Record<string, unknown>,
      }));

      const result = await this.sheets.sync(account.accountNumber, rows);
      if (result.skipped) {
        const reason = result.reason === 'no_gsheet_config' ? `no GSheet config for ${account.accountName}` : (result.reason ?? 'unknown');
        await this.log(jobId, `Force resync — ${label}: skipped — ${reason}`, 'sheets_sync', 'warn');
        await this.upsertJobAccount(jobId, bankAccountId, { sheetsSyncStatus: 'skipped', sheetsSyncError: reason });
      } else {
        await this.log(jobId, `Force resync — ${label}: pushed ${pl(result.rowsSynced ?? 0, 'row')} to GSheets.`, 'sheets_sync', 'success');
        // This was the missing piece — the log line alone told the story, but nothing
        // ever flipped BankSyncJobAccount.sheetsSyncStatus back to 'completed', so the
        // job summary table (getJobSummary, driven entirely by this DB field) kept
        // showing whatever status the ORIGINAL failed sync left behind — "Sync failed"
        // forever, no matter how many times a force resync succeeded afterward.
        await this.upsertJobAccount(jobId, bankAccountId, {
          sheetsSyncStatus: 'completed',
          rowsSynced: result.rowsSynced ?? 0,
          sheetsSyncError: null,
        });
      }
      await this.maybeHealJobStatus(jobId);
      return { accountNumber: account.accountNumber, rowsSynced: result.rowsSynced ?? 0, skipped: result.skipped, reason: result.reason };
    } catch (err) {
      const msg = (err as Error).message ?? 'Unknown error';
      await this.log(jobId, `Force resync — ${label}: failed — ${msg}`, 'sheets_sync', 'error');
      await this.upsertJobAccount(jobId, bankAccountId, { sheetsSyncStatus: 'failed', sheetsSyncError: msg });
      throw err;
    }
  }

  // Runs after every force-resync — a job that was left 'failed' purely because ONE OR
  // MORE accounts failed to sync to Sheets should flip back to 'completed' once every
  // account has since been resolved (fixed via force resync, or already fine to begin
  // with), so the top-level banner/step stop reading "failed" forever after the user
  // has actually repaired everything through this side channel.
  //
  // Deliberately conservative: only touches a job that's (a) currently 'failed', and
  // (b) didn't fail because of the DOWNLOAD step (bank_sync) — force resync only
  // re-pushes rows already in the DB, it can't fix a genuine fetch failure, so a job
  // that failed for that reason must stay failed regardless of any Sheets outcome.
  private async maybeHealJobStatus(jobId: number): Promise<void> {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { id: jobId }, select: { status: true, steps: true } });
    if (!job || job.status !== JOB_STATUS.FAILED) return;

    const steps = parseSteps(job.steps);
    const bankSyncStep = steps.find(s => s.key === 'bank_sync');
    if (bankSyncStep?.status === 'failed') return;

    const jobAccounts = await this.prisma.bankSyncJobAccount.findMany({
      where: { jobId },
      select: { status: true, sheetsSyncStatus: true },
    });
    if (jobAccounts.length === 0) return;
    const stillFailed = jobAccounts.some(a => a.status === 'failed' || a.sheetsSyncStatus === 'failed');
    if (stillFailed) return;

    // Update status/errorMessage directly (not via updateJob()) — updateJob() adds this
    // attempt's elapsed wall-clock time to durationMsTotal, which would wrongly count
    // the entire idle gap between the original failed run and whenever the user got
    // around to force-resyncing it, hours or days of "duration" that was never actually
    // spent running anything.
    await this.prisma.bankSyncJob.update({
      where: { id: jobId },
      data: { status: JOB_STATUS.COMPLETED, errorMessage: null },
    });
    await this.updateStep(jobId, 'sheets_sync', { status: 'completed', completedAt: new Date().toISOString(), errorMessage: null });
    await this.log(jobId, 'All accounts resolved via force resync — job marked completed.', 'sheets_sync', 'success');
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
