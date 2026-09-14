import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import Redis from 'ioredis';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { JOB_STATUS, FAIL_REASON } from './constants';
import { PlaywrightService, computeDateRange, type DiscoveredAccount, type PdfRowKey } from './services/playwright.service';
import { ExcelService, type TransactionRow } from './services/excel.service';
import { SheetsService } from './services/sheets.service';
import { DriveService } from './services/drive.service';

// Local-disk cache for a PDF between "secured in S3" and "synced to Drive" — the fast
// path for both the immediate Drive attempt right after a fetch AND a same-host retry
// is the file already sitting on disk (no network round trip). S3 is only re-read as a
// fallback once this file is gone (worker restarted/redeployed, disk cleared, etc) —
// see readPdfBuffer()/cleanupPdfTempFile() below.
const PDF_TEMP_DIR = path.join(os.tmpdir(), 'intrepid-bank-pdfs');

function pdfTempPath(bankTransactionId: number): string {
  return path.join(PDF_TEMP_DIR, `${bankTransactionId}.pdf`);
}

type StepKey = 'bank_sync' | 'sheets_sync' | 'pdf_export' | 'drive_sync';
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
  { key: 'bank_sync',   label: 'Lấy sao kê',          status: 'pending', startedAt: null, completedAt: null, errorMessage: null },
  { key: 'pdf_export',  label: 'Xuất PDF giao dịch',  status: 'pending', startedAt: null, completedAt: null, errorMessage: null },
  { key: 'drive_sync',  label: 'Đồng bộ Google Drive', status: 'pending', startedAt: null, completedAt: null, errorMessage: null },
  { key: 'sheets_sync', label: 'Đồng bộ GSheets',     status: 'pending', startedAt: null, completedAt: null, errorMessage: null },
];

// HSBC's row action button aria-label embeds "at D MMM YYYY HH:mm" (e.g. "at 28 Aug
// 2026 10:49") — see playwright.service.ts's ROW_REFERENCE_RE. Only the date part is
// used here (to bound a BankTransaction lookup to that calendar day); the exact
// minute isn't needed since customerReference/bankReference already disambiguates
// same-day transactions.
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function parseAriaDate(dateTimeLabel: string): Date | null {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/.exec(dateTimeLabel.trim());
  if (!m) return null;
  const month = MONTH_ABBR.indexOf(m[2]);
  if (month < 0) return null;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
}

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
    private readonly drive: DriveService,
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
    const step3Done = steps.find(s => s.key === 'pdf_export')?.status === 'completed';
    const step4Done = steps.find(s => s.key === 'drive_sync')?.status === 'completed';

    try {
      // ── Step 1: Fetch bank statement (+ PDF export, interleaved per-account) ──
      // PDF export is folded into the SAME per-account loop as bank_sync (it needs
      // that account's live, already-filtered browser page right after the Excel
      // download — see runPdfExportForAccount(), called from runBankSync()) rather
      // than running as a separate step afterward.
      //
      // A retry whose Excel fetch already succeeded (step1Done) but whose PDF export
      // didn't (!step3Done) must NOT redo the Excel download — it already has what it
      // needs on file. runPdfExportOnly() handles that case by repositioning each
      // account live on HSBC (account switch + date filter only, via
      // navigateToAccountAndApplyFilter()) and scanning for PDFs directly, skipping
      // the Excel export/parse/store entirely.
      let accountRows = new Map<string, TransactionRow[]>();
      let pdfExportMs = 0;

      if (!step1Done) {
        await this.updateStep(jobId, 'bank_sync', { status: 'running', startedAt: new Date().toISOString() });
        await this.updateStep(jobId, 'pdf_export', { status: 'running', startedAt: new Date().toISOString() });
        // Drive delivery happens interleaved inside the SAME per-account loop as
        // pdf_export (see attemptDriveUpload() calls in runPdfExportForAccount()) — it
        // has no separate execution phase of its own during a normal run, only a
        // separate STEP so it can be inspected/retried independently afterward. Marked
        // 'running' alongside pdf_export here; finalized as its own step below once
        // the loop (and therefore any Drive attempts within it) has actually finished.
        await this.updateStep(jobId, 'drive_sync', { status: 'running', startedAt: new Date().toISOString() });
        const bankSyncResult = await this.runBankSync(jobId);
        accountRows = bankSyncResult.rows;
        pdfExportMs = bankSyncResult.pdfExportMs;
        await this.updateStep(jobId, 'bank_sync', { status: 'completed', completedAt: new Date().toISOString() });
      } else {
        await this.log(jobId, 'Bank sync already completed — loading transactions from DB.', 'sheets_sync', 'success');
        accountRows = await this.loadTransactionsForJob(jobId);
        await this.log(jobId, `Loaded ${pl(accountRows.size, 'account number')} from DB.`, 'sheets_sync');

        if (!step3Done) {
          await this.updateStep(jobId, 'pdf_export', { status: 'running', startedAt: new Date().toISOString() });
          await this.updateStep(jobId, 'drive_sync', { status: 'running', startedAt: new Date().toISOString() });
          pdfExportMs = await this.runPdfExportOnly(jobId);
        }
      }

      // Aggregate PDF outcome across every account touched by this job so far (whether
      // just fetched above, or already recorded by a prior attempt) — drives both the
      // pdf_export step's final status and the job-level completion check below. This
      // is the "PDF fetching counts toward whether the day is done" criterion.
      const pdfAccounts = await this.prisma.bankSyncJobAccount.findMany({
        where: { jobId },
        select: { pdfStatus: true, pdfFailed: true },
      });
      const pdfExportFailed = pdfAccounts.some(a => a.pdfStatus === 'failed');
      const pdfFailedCount = pdfAccounts.reduce((sum, a) => sum + a.pdfFailed, 0);
      // startedAt is backdated from completedAt by the REAL cumulative time spent
      // inside runPdfExportForAccount() (pdfExportMs) — not bank_sync's own start —
      // so a run where every account hit a no-data/already-synced path (pdfExportMs=0)
      // honestly shows ~0s instead of falsely mirroring bank_sync's whole duration,
      // which previously made "Export transaction PDFs" look like it did real work
      // even when it never opened a single live page.
      const pdfCompletedAt = new Date();
      const pdfStartedAt = new Date(pdfCompletedAt.getTime() - pdfExportMs);
      await this.updateStep(jobId, 'pdf_export', {
        status: pdfExportFailed ? 'failed' : 'completed',
        startedAt: pdfStartedAt.toISOString(),
        completedAt: pdfCompletedAt.toISOString(),
        errorMessage: pdfExportFailed ? `${pdfFailedCount} PDF(s) failed to export` : null,
      });

      // ── Drive sync — independently retryable, never fails the job ──────────
      // Two branches: (a) a standalone retry of JUST this step (bank_sync and
      // pdf_export already completed on an earlier attempt) — actually does new work
      // via forceResyncDriveForJob(), no Playwright/HSBC needed since the PDF already
      // sits in S3; (b) the normal pass-through case — Drive attempts (if any) already
      // ran interleaved inside pdf_export above, this just aggregates their outcome
      // into the step's own status. Drive failures are reported here for visibility
      // but deliberately excluded from pdfExportFailed/the job-failure check below —
      // the PDF itself is already safe in S3, Drive is a best-effort mirror that
      // retries automatically (or via this same step's retry button) without ever
      // forcing a re-fetch from HSBC.
      if (step1Done && step3Done && !step4Done) {
        await this.updateStep(jobId, 'drive_sync', { status: 'running', startedAt: new Date().toISOString() });
        const driveRetry = await this.forceResyncDriveForJob(jobId);
        await this.updateStep(jobId, 'drive_sync', {
          status: driveRetry.failed > 0 ? 'failed' : 'completed',
          completedAt: new Date().toISOString(),
          errorMessage: driveRetry.failed > 0 ? `${driveRetry.failed} PDF(s) still failed to sync to Drive` : null,
        });
      } else {
        const driveRows = await this.prisma.bankTransactionPdf.findMany({ where: { jobId }, select: { driveSyncStatus: true } });
        const driveFailedCount = driveRows.filter(r => r.driveSyncStatus === 'failed').length;
        await this.updateStep(jobId, 'drive_sync', {
          status: driveFailedCount > 0 ? 'failed' : 'completed',
          startedAt: pdfStartedAt.toISOString(),
          completedAt: pdfCompletedAt.toISOString(),
          errorMessage: driveFailedCount > 0 ? `${driveFailedCount} PDF(s) failed to sync to Drive` : null,
        });
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

      if (sheetsSyncFailed || pdfExportFailed) {
        const errorParts = [
          sheetsSyncFailed ? `GSheets sync failed for ${sheetsFailedCount} account(s)` : null,
          pdfExportFailed ? `PDF export failed for ${pdfFailedCount} transaction(s)` : null,
        ].filter(Boolean);
        await this.updateJob(jobId, JOB_STATUS.FAILED, undefined, errorParts.join('; '));
        await this.log(jobId, 'Job failed — one or more accounts failed to sync to Google Sheets or export PDFs.', undefined, 'error');
        const notifyParts = [
          sheetsSyncFailed ? `${sheetsFailedCount} tài khoản lỗi khi đồng bộ Google Sheets.` : null,
          pdfExportFailed ? `${pdfFailedCount} giao dịch lỗi khi xuất PDF.` : null,
        ].filter(Boolean);
        await this.notify(jobId, 'job_failed', 'Đồng bộ sao kê thất bại', notifyParts.join(' '));
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

      // Mark every currently running step as failed/cancelled — bank_sync AND
      // pdf_export are typically BOTH 'running' at once (pdf_export executes nested
      // inside runBankSync()'s per-account loop, see run() above), so a single
      // `.find()` would silently leave one of them stuck at 'running' forever.
      const current = await this.prisma.bankSyncJob.findUnique({ where: { id: jobId }, select: { status: true, steps: true } });
      const currentSteps = parseSteps(current?.steps);
      const runningSteps = currentSteps.filter(s => s.status === 'running');

      if (current?.status === JOB_STATUS.CANCELLED || msg === 'JOB_CANCELLED') {
        for (const step of runningSteps) {
          await this.updateStep(jobId, step.key, {
            status: 'failed',
            completedAt: new Date().toISOString(),
            errorMessage: 'Cancelled by user',
          });
        }
        return; // Status already set to cancelled by API — don't throw
      }

      for (const step of runningSteps) {
        await this.updateStep(jobId, step.key, {
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

  /** Shared by runBankSync() and runPdfExportOnly() — logs under whichever step is currently 'running'. */
  private async ensureAuthenticated(jobId: number, logStepKey: StepKey): Promise<void> {
    const settings = await this.prisma.bankJobSettings.findUnique({ where: { id: 'default' } });
    await this.playwright.init();
    await this.log(jobId, 'Browser ready — checking session...', logStepKey);
    await this.updateJob(jobId, JOB_STATUS.CHECKING_SESSION);

    if (!(await this.playwright.isLoggedIn())) {
      await this.log(jobId, 'Session expired — logging in.', logStepKey);
      await this.updateJob(jobId, JOB_STATUS.LOGGING_IN);
      const username = settings?.hsbcnetUsername ?? '';
      if (!username) {
        throw new Error('HSBCNET_USERNAME_NOT_CONFIGURED');
      }
      await this.playwright.login(username);
      await this.log(jobId, `Username entered (${username}) — waiting for 2FA on phone...`, logStepKey);
      await this.updateJob(jobId, JOB_STATUS.WAITING_2FA);
      await this.notify(jobId, 'job_waiting_2fa', 'HSBCnet cần xác nhận đăng nhập', 'Mở app HSBCnet trên điện thoại để xác nhận đăng nhập.');
      await this.playwright.wait2FA(() => this.isJobCancelled(jobId));
      await this.log(jobId, '2FA confirmed.', logStepKey, 'success');
      await this.playwright.saveSession();
      await this.log(jobId, 'Session saved for reuse.', logStepKey, 'success');
    } else {
      await this.log(jobId, 'Session still valid — skipping authentication.', logStepKey, 'success');
    }

    await this.updateJob(jobId, JOB_STATUS.AUTHENTICATED);
    await this.log(jobId, 'Authenticated successfully.', logStepKey, 'success');
  }

  /**
   * Retry path for a job whose bank_sync (Excel) step already completed but
   * pdf_export hasn't — reposition each account live on HSBC (account switch + date
   * filter only, via navigateToAccountAndApplyFilter()) and run the PDF scan
   * directly, WITHOUT re-downloading Excel it doesn't need again. Used by run()
   * whenever step1Done && !step3Done — see the branch there.
   */
  private async runPdfExportOnly(jobId: number): Promise<number> {
    let pdfExportMs = 0;

    // Read back the EXACT range the original bank_sync run persisted (see runBankSync()
    // 1a) rather than recomputing from today's settings — a retry days later must still
    // reposition each account on the same range it originally fetched, not "yesterday"
    // as of whenever the retry happens to run.
    const job = await this.prisma.bankSyncJob.findUnique({
      where: { id: jobId },
      select: { dateRangeFrom: true, dateRangeTo: true },
    });
    const dateFrom = job?.dateRangeFrom;
    const dateTo = job?.dateRangeTo;
    if (!dateFrom || !dateTo) {
      throw new Error('Job has no persisted date range — cannot reposition accounts for PDF export.');
    }

    await this.ensureAuthenticated(jobId, 'pdf_export');
    // Land on account-detail (the "Change account" search + transaction table this
    // needs) — a fresh login lands on the dashboard, not here, and even a reused
    // session isn't guaranteed to still be sitting on it from a prior run.
    await this.playwright.navigateToAccountDetailPage();

    const accounts = await this.prisma.bankAccount.findMany({
      where: { syncEnabled: true, accountNameRef: { isActive: true } },
      orderBy: [{ accountName: 'asc' }, { accountNumber: 'asc' }],
    });
    const groups = new Map<string, typeof accounts>();
    for (const account of accounts) {
      if (!groups.has(account.accountName)) groups.set(account.accountName, []);
      groups.get(account.accountName)!.push(account);
    }

    for (const [groupName, groupAccounts] of groups) {
      await this.log(jobId, `${groupName} (${pl(groupAccounts.length, 'account number')}):`, 'pdf_export');

      for (const account of groupAccounts) {
        if (await this.isJobCancelled(jobId)) {
          await this.log(jobId, 'Job cancelled by user.', 'pdf_export', 'warn');
          throw new Error('JOB_CANCELLED');
        }

        let hasData: boolean;
        try {
          hasData = await this.playwright.navigateToAccountAndApplyFilter(
            account.accountNumber, dateFrom, dateTo, () => this.isJobCancelled(jobId),
          );
        } catch (err) {
          const msg = (err as Error).message ?? 'Navigation error';
          if (msg === 'JOB_CANCELLED') throw err;
          // Same "not listed on HSBC today" carve-out as runBankSync() — an account
          // absent from today's switcher is expected, not a fetch failure.
          if (/not found in HSBC's account list/.test(msg)) {
            await this.log(jobId, `  → ${account.accountNumber}: not listed on HSBC today — no data.`, 'pdf_export', 'warn');
            await this.upsertJobAccount(jobId, account.id, { pdfStatus: 'no_data', pdfFetched: 0, pdfFailed: 0, pdfError: null });
            continue;
          }
          await this.log(jobId, `  → ${account.accountNumber}: could not reposition for PDF export — ${msg}`, 'pdf_export', 'error');
          await this.upsertJobAccount(jobId, account.id, { pdfStatus: 'failed', pdfError: msg });
          continue;
        }

        if (!hasData) {
          await this.log(jobId, `  → ${account.accountNumber}: no transactions in range — nothing to export.`, 'pdf_export');
          await this.upsertJobAccount(jobId, account.id, { pdfStatus: 'no_data', pdfFetched: 0, pdfFailed: 0, pdfError: null });
          continue;
        }

        const pdfExportStart = Date.now();
        await this.runPdfExportForAccount(jobId, account);
        pdfExportMs += Date.now() - pdfExportStart;
      }
    }

    return pdfExportMs;
  }

  // ─── Step 1: Bank sync (login → discover → download → parse → store) ────────

  private async runBankSync(jobId: number): Promise<{ rows: Map<string, TransactionRow[]>; pdfExportMs: number }> {
    const result = new Map<string, TransactionRow[]>();
    // Real cumulative time spent actually scanning/exporting PDFs (see the
    // runPdfExportForAccount() call below) — used by run() to give the pdf_export
    // step an honest duration instead of reusing bank_sync's whole start/end window,
    // which would show e.g. "31s" even on a run where every account hit a no-data
    // path above and PDF export never touched a single live page.
    let pdfExportMs = 0;

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
          // No live HSBC page is ever opened on this bail-out path (see comment above:
          // "skipping HSBC login entirely"), so there's no table to scan for PDFs either —
          // explicitly 'no_data', not the pdfStatus column's default 'pending', which would
          // otherwise sit there forever looking like PDF export never got around to this
          // account rather than correctly reporting "nothing to export this run". Also
          // reset pdfFetched/pdfFailed/pdfError — upsert's `update` only touches listed
          // fields, so without this a PREVIOUS run's failure count/message would keep
          // showing next to a status that now says "nothing to do this run".
          pdfStatus: 'no_data',
          pdfFetched: 0,
          pdfFailed: 0,
          pdfError: null,
          rowsDownloaded: existingCount,
          rowsInserted: 0,
          rowsDuplicate: existingCount,
        });
        await this.registerJobOwnership(jobId, account.id, dateFrom, dateTo);
      }
      return { rows: result, pdfExportMs: 0 };
    }

    // ── 1c. Browser + auth ────────────────────────────────────────────────────
    await this.ensureAuthenticated(jobId, 'bank_sync');

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
            // Same reasoning as the allAlreadyCovered bail-out above — no live page
            // opened for this account this run, so pdfStatus must be explicit 'no_data',
            // not left at the column's default 'pending' (which would misleadingly
            // read as "PDF export still owes this account something" forever). Reset
            // pdfFetched/pdfFailed/pdfError too, or a previous run's failure lingers
            // next to a status that now says there's nothing to do.
            pdfStatus: 'no_data',
            pdfFetched: 0,
            pdfFailed: 0,
            pdfError: null,
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
            await this.upsertJobAccount(jobId, account.id, { status: 'completed', sheetsSyncStatus: 'no_data', pdfStatus: 'no_data', pdfFetched: 0, pdfFailed: 0, pdfError: null });
            continue;
          }
          await this.log(jobId, `  → ${account.accountNumber}: fetch failed — ${msg} [${FAIL_REASON.DOWNLOAD_ERROR}]`, 'bank_sync', 'error');
          await this.upsertJobAccount(jobId, account.id, { status: 'failed', errorMessage: msg });
          continue;
        }

        if (excelBuffer === null) {
          await this.log(jobId, `  → ${account.accountNumber}: no transactions in range.`, 'bank_sync');
          await this.upsertJobAccount(jobId, account.id, { status: 'completed', sheetsSyncStatus: 'no_data', pdfStatus: 'no_data', pdfFetched: 0, pdfFailed: 0, pdfError: null });
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

        // PDF export runs HERE — while the page is still on this account's live,
        // date-filtered transaction table (right before switching to the next
        // account) — not as a separate step afterward, since it needs that exact
        // browser state. Skips accounts on the "already synced" path above entirely
        // (known limitation: an account whose range was marked fully synced by an
        // earlier run, before this feature existed or before PDF export was enabled
        // for it, never gets its live table re-opened to backfill those PDFs — same
        // class of gap forceResyncSheets exists to patch for Sheets).
        const pdfExportStart = Date.now();
        await this.runPdfExportForAccount(jobId, account);
        pdfExportMs += Date.now() - pdfExportStart;

        // Include the account even with 0 new rows if it has never been synced to
        // GSheets successfully — otherwise a fixed config/retry would never get a
        // chance to push already-downloaded data that previously failed to sync.
        const everSynced = await this.prisma.bankSyncJobAccount.findFirst({
          where: { bankAccountId: account.id, sheetsSyncStatus: 'completed' },
          select: { id: true },
        });

        if (inserted > 0 || !everSynced) {
          // Which exact rows to push to Sheets is resolved below via
          // loadTransactionsForJob() (DB-driven — only this job's genuinely NEW rows,
          // or full history for a never-synced account) — NOT `rows` here, which is
          // this whole download's raw parse and would include already-synced
          // duplicates whenever this same range gets re-fetched (e.g. a manual re-run
          // later the same day re-finding a handful of new transactions alongside ones
          // already pushed this morning) — re-pushing those duplicates onto the sheet
          // every time, since Sheets itself has no dedup ([[project-bank-sync-design]]).
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
    // Browser stays open — session reused by next job run.
    // Rebuild the row set to sync from DB (same query loadTransactionsForJob() uses
    // for the step2-only retry path) instead of accumulating it during the loop above —
    // see the comment at the `withNew++` site for why.
    return { rows: await this.loadTransactionsForJob(jobId), pdfExportMs };
  }

  // ─── PDF export (nested inside Step 1's per-account loop) ───────────────────

  /**
   * Scan `account`'s currently-displayed transaction table for rows with a "..."
   * action button, fetch a PDF via HSBC's "Chi tiết giao dịch" popup for every one
   * not already fetched (dedup key: BankTransactionPdf.status on the matched
   * BankTransaction row — see PdfRowKey/exportTransactionPdfs() docstring), and
   * secure it in S3. Records the aggregate outcome on BankSyncJobAccount.
   *
   * Fetch (HSBC → S3) and Drive delivery are two independently-retryable stages —
   * see BankTransactionPdf.status vs .driveSyncStatus in schema.prisma. `status` alone
   * gates re-running the Playwright click-through; a Drive outage never forces
   * re-fetching from HSBC, since the PDF bytes are already sitting in S3 and Drive
   * upload just re-reads them from there (attemptDriveUpload/syncPendingDriveUploads).
   *
   * Must be called right after this account's Excel download + storeTransactions()
   * succeed, while playwright is still on this account's filtered page.
   */
  private async runPdfExportForAccount(
    jobId: number,
    account: { id: number; accountCode: string; accountName: string; accountNumber: string },
  ): Promise<void> {
    // No separate "PDF export enabled" toggle — every account reaching this point was
    // already selected via `where: { syncEnabled: true, accountNameRef: { isActive: true } }`
    // by the caller, so PDF fetch just follows Sync. Whether it also gets pushed to Drive
    // is a fully independent, later stage (see syncPendingDriveUploads() below and its
    // docstring): fetch (HSBC → S3) always runs here; attemptDriveUpload()/
    // drive.service.ts's own uploadPdf() separately checks isActive/rootFolderId and
    // skips just the upload step when Drive isn't configured yet.

    // Backfill first — retry Drive delivery for any PDF this account already secured
    // in S3 on a previous run but never made it to Drive (Drive outage, missing config
    // at the time, etc). Pure S3→Drive, no Playwright/HSBC involved.
    await this.syncPendingDriveUploads(jobId, account);

    let driveSynced = 0;
    let driveFailed = 0;

    // Shared by both callbacks below — re-queried each time rather than cached across
    // the shouldFetch→onCaptured pair, so there's no shared mutable state to get out
    // of sync (the extra DB round trip is negligible next to a full PDF export).
    const findTxn = (reference: string, dateTimeLabel: string) => {
      const day = parseAriaDate(dateTimeLabel);
      if (!day) return Promise.resolve(null);
      const dayStart = day;
      const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);
      return this.prisma.bankTransaction.findFirst({
        where: {
          bankAccountId: account.id,
          postDate: { gte: dayStart, lte: dayEnd },
          OR: [{ customerReference: reference }, { bankReference: reference }],
        },
        include: { pdf: true },
      });
    };

    // Rows the aria-label→BankTransaction match fails for. This is the NORMAL case,
    // not an error: the transaction table on screen shows rows across many days/pages,
    // while we've only stored the day(s) this sync run actually fetched — a row from
    // outside that range simply has nothing to match against yet, and that's expected.
    // Only a row that DOES match a stored BankTransaction but then fails to actually
    // fetch/upload its PDF is a real problem (tracked via result.failed below). Kept
    // here purely for diagnostics (logged at 'info', not counted toward pdfFailed).
    const unmatched: PdfRowKey[] = [];

    let result: { scanned: number; fetched: number; failed: number; errors: Array<{ reference: string; message: string }> };
    try {
      result = await this.playwright.exportTransactionPdfs(
        account.accountNumber,
        async (key: PdfRowKey) => {
          const txn = await findTxn(key.reference, key.dateTimeLabel);
          if (!txn) {
            unmatched.push(key);
            return false;
          }
          // Dedup key is the BankTransaction row (via its linked BankTransactionPdf),
          // NOT the AITRANPRINT export filename — that filename is regenerated with a
          // fresh timestamp on every export, so it can't identify "already fetched".
          return txn.pdf?.status !== 'fetched';
        },
        async (key: PdfRowKey, pdf: Buffer, fileName: string) => {
          const txn = await findTxn(key.reference, key.dateTimeLabel);
          if (!txn) {
            this.logger.error(`[pdf_export] ${account.accountNumber}: lost match for reference "${key.reference}" between scan and capture`);
            return;
          }

          // Keep a local-disk copy before anything else — attemptDriveUpload() below
          // (and any later same-host retry) reads from here first and only touches S3
          // once this file is gone, so the immediate Drive attempt right after a fetch
          // never re-downloads what we're already holding.
          await this.writePdfTempFile(txn.id, pdf).catch(
            (err) => this.logger.warn(`[pdf_export] ${account.accountNumber}: failed to write local PDF cache for txn ${txn.id}: ${(err as Error).message}`),
          );

          // Step 1 — secure the PDF in S3. This alone sets status='fetched', which is
          // what shouldFetch() above checks to skip re-clicking through HSBC on a later
          // run. Drive delivery (step 2) is a separate, independently-retryable concern.
          const s3Result = await this.drive.uploadToS3(account.accountName, account.accountNumber, txn.postDate, pdf, fileName)
            .catch((err): { skipped: true; reason: string } => ({ skipped: true, reason: (err as Error).message }));

          await this.prisma.bankTransactionPdf.upsert({
            where: { bankTransactionId: txn.id },
            create: {
              bankTransactionId: txn.id,
              jobId,
              status: s3Result.skipped ? 'failed' : 'fetched',
              fileName,
              s3Key: !s3Result.skipped ? s3Result.s3Key : null,
              errorMessage: s3Result.skipped ? s3Result.reason : null,
              fetchedAt: s3Result.skipped ? null : new Date(),
            },
            update: {
              jobId,
              status: s3Result.skipped ? 'failed' : 'fetched',
              fileName,
              s3Key: !s3Result.skipped ? s3Result.s3Key : null,
              errorMessage: s3Result.skipped ? s3Result.reason : null,
              fetchedAt: s3Result.skipped ? null : new Date(),
            },
          });

          if (s3Result.skipped) throw new Error(s3Result.reason); // counted as 'failed' by exportTransactionPdfs() — S3 is required to consider a PDF "fetched"

          // Step 2 — best-effort Drive delivery right away, reading back the file we
          // just wrote to disk (not re-downloading from S3). A failure here does NOT
          // throw (does not count toward this account's pdfFailed) — it's tracked on
          // driveSyncStatus and retried automatically by the next run's
          // syncPendingDriveUploads() backfill.
          const driveOutcome = await this.attemptDriveUpload(txn.id, account, txn.postDate, fileName, s3Result.skipped ? null : s3Result.s3Key);
          if (driveOutcome.ok) driveSynced++; else driveFailed++;
        },
        () => this.isJobCancelled(jobId),
      );
    } catch (err) {
      const msg = (err as Error).message ?? 'PDF export error';
      if (msg === 'JOB_CANCELLED') throw err; // must stop the whole job, same as a download cancellation
      await this.log(jobId, `  → ${account.accountNumber}: PDF export failed — ${msg}`, 'pdf_export', 'error');
      await this.upsertJobAccount(jobId, account.id, { pdfStatus: 'failed', pdfError: msg });
      return;
    }

    // Only genuine fetch/upload failures (a row that DOES match a stored BankTransaction
    // but couldn't be captured) count as real errors — "unmatched" is normal and excluded.
    const totalFailed = result.failed;
    const pdfStatus = totalFailed > 0 ? 'failed' : (result.scanned > 0 ? 'completed' : 'no_data');
    await this.log(
      jobId,
      `  → ${account.accountNumber}: PDF scan — ${result.scanned} checked, ${result.fetched} fetched, ${totalFailed} failed` +
        (unmatched.length > 0 ? `, ${unmatched.length} not found on file (outside this sync's range — normal)` : '') + '.',
      'pdf_export',
      totalFailed > 0 ? 'error' : (result.fetched > 0 ? 'success' : 'info'),
    );
    // Log each row's actual failure reason — previously only the count made it here
    // ("1 failed"), with the real reason stranded in the worker's own console
    // (this.logger.error inside exportTransactionPdfs), invisible to anyone reading
    // the job's "Show technical details" in the UI.
    for (const e of result.errors) {
      await this.log(jobId, `  → ${account.accountNumber}: PDF failed for "${e.reference}" — ${e.message}`, 'pdf_export', 'error');
    }

    // Drive delivery is reported separately from pdfStatus above — it never blocks or
    // flips the account's PDF status to 'failed', since the file is already safely in
    // S3 (what the app itself serves) and Drive is just a mirror synced best-effort.
    if (driveSynced + driveFailed > 0) {
      await this.log(
        jobId,
        `  → ${account.accountNumber}: Drive delivery — ${driveSynced} synced, ${driveFailed} pending retry (will retry automatically next run, no HSBC re-fetch needed).`,
        'pdf_export',
        driveFailed > 0 ? 'info' : 'success',
      );
    }

    // Unmatched rows are the normal case (not having synced a given row yet), already
    // summarized in the "PDF scan — ... not found on file" line above — a per-row line
    // here too would just duplicate that count across many lines. Full candidate dump
    // (which on-file refs exist that day, for spotting a genuine mismatch) goes to
    // this.logger — console/CloudWatch only — so it doesn't clutter what the user sees.
    for (const key of unmatched) {
      const day = parseAriaDate(key.dateTimeLabel);
      if (day) {
        const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000 - 1);
        const candidates = await this.prisma.bankTransaction.findMany({
          where: { bankAccountId: account.id, postDate: { gte: day, lte: dayEnd } },
          select: { customerReference: true, bankReference: true, postDate: true },
        });
        const candidatesDesc = candidates.length === 0
          ? 'no BankTransaction rows on file for that account+day at all'
          : `on-file refs that day: ${candidates.map(c => `customerRef="${c.customerReference ?? ''}" bankRef="${c.bankReference ?? ''}"`).join(', ')}`;
        this.logger.log(`[pdf_export] ${account.accountNumber}: unmatched "${key.reference}" @ ${key.dateTimeLabel} — ${candidatesDesc}`);
      }
    }

    const pdfErrorSummary = result.errors.map(e => `${e.reference}: ${e.message}`).join('; ') || null;
    await this.upsertJobAccount(jobId, account.id, {
      pdfStatus,
      pdfFetched: result.fetched,
      pdfFailed: totalFailed,
      pdfError: pdfErrorSummary,
    });
  }

  /**
   * Write the fetched PDF to a local scratch file — the durable-enough working copy
   * that both the immediate Drive attempt and any later same-host retry read from,
   * so neither has to go back to S3 for bytes we already have sitting on this host.
   */
  private async writePdfTempFile(bankTransactionId: number, buffer: Buffer): Promise<void> {
    await fs.mkdir(PDF_TEMP_DIR, { recursive: true });
    await fs.writeFile(pdfTempPath(bankTransactionId), buffer);
  }

  /**
   * Local disk first, S3 only as the fallback once the local copy is gone (worker
   * restarted/redeployed since the fetch, disk cleared, etc) — this is the only place
   * a Drive attempt ever touches S3, and only when it has to.
   */
  private async readPdfBuffer(bankTransactionId: number, s3Key: string | null): Promise<Buffer> {
    try {
      return await fs.readFile(pdfTempPath(bankTransactionId));
    } catch {
      if (!s3Key) throw new Error('PDF missing from both local disk and S3 (no s3Key on file)');
      return this.drive.downloadFromS3(s3Key);
    }
  }

  /** Both S3 and Drive are confirmed done — the local scratch copy has served its purpose. */
  private async cleanupPdfTempFile(bankTransactionId: number): Promise<void> {
    await fs.unlink(pdfTempPath(bankTransactionId)).catch(() => {});
  }

  /**
   * Push one already-fetched PDF to Drive (reading it via readPdfBuffer — local disk
   * first, S3 fallback) and record the outcome on driveSyncStatus/driveError —
   * completely independent of BankTransactionPdf.status/errorMessage, which track the
   * HSBC→S3 fetch only. Used both for the immediate attempt right after a fresh fetch
   * and for retrying a previously-failed Drive upload out of syncPendingDriveUploads().
   * On success, removes the local scratch file — both copies (S3 + Drive) are secured.
   */
  private async attemptDriveUpload(
    bankTransactionId: number,
    account: { accountCode: string; accountName: string; accountNumber: string },
    postDate: Date,
    fileName: string,
    s3Key: string | null,
  ): Promise<{ ok: boolean; reason?: string }> {
    let pdf: Buffer;
    try {
      pdf = await this.readPdfBuffer(bankTransactionId, s3Key);
    } catch (err) {
      const reason = (err as Error).message;
      await this.prisma.bankTransactionPdf.update({
        where: { bankTransactionId },
        data: { driveSyncStatus: 'failed', driveError: reason },
      }).catch(() => {});
      return { ok: false, reason };
    }

    const driveResult = await this.drive.uploadPdf(account.accountCode, account.accountName, account.accountNumber, postDate, pdf, fileName)
      .catch((err): { skipped: true; reason: string } => ({ skipped: true, reason: (err as Error).message }));

    if (driveResult.skipped) {
      await this.prisma.bankTransactionPdf.update({
        where: { bankTransactionId },
        data: { driveSyncStatus: 'failed', driveError: driveResult.reason },
      });
      return { ok: false, reason: driveResult.reason };
    }

    await this.prisma.bankTransactionPdf.update({
      where: { bankTransactionId },
      data: {
        driveSyncStatus: 'synced',
        driveError: null,
        driveFileId: driveResult.driveFileId,
        driveFileUrl: driveResult.driveFileUrl,
        driveSyncedAt: new Date(),
      },
    });
    await this.cleanupPdfTempFile(bankTransactionId);
    return { ok: true };
  }

  /**
   * Retry Drive delivery for every PDF this account already secured in S3 on a
   * previous run but never synced to Drive (Drive outage, config only just added,
   * etc). attemptDriveUpload()'s readPdfBuffer() checks local disk first — if this
   * host still has the scratch file from the original fetch, no network call to S3
   * is needed at all; S3 only comes into play once that file is gone.
   */
  private async syncPendingDriveUploads(
    jobId: number,
    account: { id: number; accountCode: string; accountName: string; accountNumber: string },
  ): Promise<void> {
    const pending = await this.prisma.bankTransactionPdf.findMany({
      where: {
        status: 'fetched',
        driveSyncStatus: { not: 'synced' },
        s3Key: { not: null },
        bankTransaction: { bankAccountId: account.id },
      },
      include: { bankTransaction: { select: { postDate: true } } },
    });
    if (pending.length === 0) return;

    await this.log(jobId, `  → ${account.accountNumber}: retrying Drive upload for ${pending.length} already-fetched PDF(s).`, 'pdf_export');

    let synced = 0;
    let stillFailed = 0;
    for (const row of pending) {
      const fileName = row.fileName ?? `transaction-${row.bankTransactionId}.pdf`;
      const outcome = await this.attemptDriveUpload(row.bankTransactionId, account, row.bankTransaction.postDate, fileName, row.s3Key);
      if (outcome.ok) synced++; else stillFailed++;
    }

    await this.log(
      jobId,
      `  → ${account.accountNumber}: Drive retry — ${synced} synced, ${stillFailed} still failing.`,
      'pdf_export',
      stillFailed > 0 ? 'info' : 'success',
    );
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
    // re-sorts by postDate itself before writing (excel.service.ts already reverses
    // HSBC's newest-first export before insertion, so id ASC matches bank order for
    // the common case — see sheets.service.ts for the accepted edge case and repair tool).
    const ownTxns = await this.prisma.bankTransaction.findMany({
      where: { jobId },
      include: { bankAccount: { select: { accountNumber: true } } },
      orderBy: [{ postDate: 'asc' }, { id: 'asc' }],
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
          orderBy: [{ postDate: 'asc' }, { id: 'asc' }],
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
      pdfStatus: string;
      pdfFetched: number;
      pdfFailed: number;
      pdfError: string | null;
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
      // orderBy is cosmetic — sheets.service.ts re-sorts by postDate itself before
      // appending. id ASC matches bank order for the common case (excel.service.ts
      // reverses HSBC's newest-first export before insertion) — see sheets.service.ts
      // for the accepted edge case (same day fetched across ≥2 job runs) and its
      // balance-chain-based repair tool for when that actually happens.
      const dbRows = await this.prisma.bankTransaction.findMany({
        where: { bankAccountId, jobIds: { has: jobId } },
        orderBy: [{ postDate: 'asc' }, { id: 'asc' }],
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

  // ─── Force resync Drive (user-triggered, from the job detail page) ──────────
  // Mirrors forceResyncSheets above but for Drive delivery — no Playwright/HSBC
  // involved at all, since the PDF already sits in S3 (attemptDriveUpload just
  // re-reads it and re-uploads). Scoped to what THIS job actually fetched
  // (BankTransactionPdf.jobId) — same per-job scoping as pdfFetched/pdfFailed on
  // BankSyncJobAccount, so a row on the summary table only ever offers to retry
  // what it's showing as failed/pending for that specific job, not this account's
  // entire cross-job history.
  async forceResyncDrive(bankAccountId: number, jobId: number): Promise<{ accountNumber: string; synced: number; failed: number; skipped: boolean }> {
    const account = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!account) throw new Error('BANK_ACCOUNT_NOT_FOUND');

    const pending = await this.prisma.bankTransactionPdf.findMany({
      where: {
        status: 'fetched',
        driveSyncStatus: { not: 'synced' },
        s3Key: { not: null },
        bankTransaction: { bankAccountId },
        jobId,
      },
      include: { bankTransaction: { select: { postDate: true } } },
    });
    if (pending.length === 0) return { accountNumber: account.accountNumber, synced: 0, failed: 0, skipped: true };

    let synced = 0;
    let failed = 0;
    for (const row of pending) {
      const fileName = row.fileName ?? `transaction-${row.bankTransactionId}.pdf`;
      const outcome = await this.attemptDriveUpload(row.bankTransactionId, account, row.bankTransaction.postDate, fileName, row.s3Key);
      if (outcome.ok) synced++; else failed++;
    }

    await this.log(
      jobId,
      `Force resync Drive — ${account.accountName} (${account.accountNumber}): ${synced} synced, ${failed} failed.`,
      'drive_sync',
      failed > 0 ? 'error' : 'success',
    );
    await this.maybeHealDriveStep(jobId);
    return { accountNumber: account.accountNumber, synced, failed, skipped: false };
  }

  // Bulk variant — every account this job has its own BankSyncJobAccount row for.
  // Used both by the job detail page's "retry all" header action and by run()'s
  // standalone drive_sync-step retry (bank_sync/pdf_export already completed on an
  // earlier attempt — see the run() branch above).
  async forceResyncDriveForJob(jobId: number): Promise<{ synced: number; failed: number; accountsRetried: number }> {
    const jobAccounts = await this.prisma.bankSyncJobAccount.findMany({ where: { jobId }, select: { bankAccountId: true } });
    let synced = 0;
    let failed = 0;
    let accountsRetried = 0;
    for (const ja of jobAccounts) {
      const res = await this.forceResyncDrive(ja.bankAccountId, jobId);
      if (!res.skipped) accountsRetried++;
      synced += res.synced;
      failed += res.failed;
    }
    return { synced, failed, accountsRetried };
  }

  // Mirrors maybeHealJobStatus's spirit but scoped to just the drive_sync step — once
  // every Drive delivery this job is responsible for is confirmed synced, flip the
  // step (if it was sitting 'failed') back to 'completed' so the timeline stops
  // reading "failed" forever after the user has actually repaired it via force resync.
  private async maybeHealDriveStep(jobId: number): Promise<void> {
    const remaining = await this.prisma.bankTransactionPdf.count({
      where: { jobId, status: 'fetched', driveSyncStatus: 'failed' },
    });
    if (remaining === 0) {
      await this.updateStep(jobId, 'drive_sync', { status: 'completed', completedAt: new Date().toISOString(), errorMessage: null });
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
