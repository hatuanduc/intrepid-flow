import { Injectable, NotFoundException, ConflictException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobSchedulerService } from '../../common/job-scheduler.service';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/settings.dto';
import { UpdateTemplateDto } from './dto/template.dto';
import { UpsertGsheetConfigDto } from './dto/gsheet-config.dto';

const SETTINGS_ID = 'default';

export type StepKey = 'bank_sync' | 'sheets_sync';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export type JobStep = {
  key: StepKey;
  label: string;
  status: StepStatus;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
};

const INITIAL_STEPS: JobStep[] = [
  { key: 'bank_sync',    label: 'Lấy sao kê',        status: 'pending', startedAt: null, completedAt: null, errorMessage: null },
  { key: 'sheets_sync',  label: 'Đồng bộ GSheets',   status: 'pending', startedAt: null, completedAt: null, errorMessage: null },
];

function parseSteps(raw: unknown): JobStep[] {
  if (!Array.isArray(raw) || raw.length === 0) return INITIAL_STEPS.map(s => ({ ...s }));
  return raw as JobStep[];
}

function generateJobPublicId(): string {
  return `job_${crypto.randomBytes(9).toString('base64url')}`;
}

export type JobStatsDto = {
  totalAccounts: number;
  downloaded: number;
  downloadFailed: number;
  synced: number;
  syncFailed: number;
  syncSkipped: number;
  syncPending: number;
  syncNoData: number;
  totalRowsDownloaded: number;
  totalRowsInserted: number;
  totalRowsSynced: number;
};

export type BankSyncJobDto = {
  id: string;
  status: string;
  triggeredBy: string | null;
  triggeredByName: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  logs: Array<{ time: string; message: string; step?: string }>;
  steps: JobStep[];
  createdAt: Date;
  durationMs: number | null;
  stats: JobStatsDto | null;
  // The actual HSBC date range this run used — set by the worker once computed
  // (from either dateFromOverride/dateToOverride or the default syncDateMode).
  // Null until the worker reaches that point (e.g. still pending/logging in).
  dateRangeFrom: Date | null;
  dateRangeTo: Date | null;
};

type JobAccountRow = { status: string; sheetsSyncStatus: string; rowsDownloaded: number; rowsInserted: number; rowsSynced: number };

function computeJobStats(accounts: JobAccountRow[]): JobStatsDto | null {
  if (accounts.length === 0) return null;
  return {
    totalAccounts: accounts.length,
    downloaded: accounts.filter(a => a.status === 'completed').length,
    downloadFailed: accounts.filter(a => a.status === 'failed').length,
    synced: accounts.filter(a => a.sheetsSyncStatus === 'completed').length,
    syncFailed: accounts.filter(a => a.sheetsSyncStatus === 'failed').length,
    syncSkipped: accounts.filter(a => a.status === 'completed' && a.sheetsSyncStatus === 'skipped').length,
    syncPending: accounts.filter(a => a.status === 'completed' && a.sheetsSyncStatus === 'pending').length,
    syncNoData: accounts.filter(a => a.sheetsSyncStatus === 'no_data').length,
    totalRowsDownloaded: accounts.reduce((s, a) => s + a.rowsDownloaded, 0),
    totalRowsInserted: accounts.reduce((s, a) => s + a.rowsInserted, 0),
    totalRowsSynced: accounts.reduce((s, a) => s + a.rowsSynced, 0),
  };
}

// triggeredBy is either the literal 'cron' (scheduled run) or a stringified user id
// (manual trigger/retry) — never a display name itself, so the caller resolves it
// against a batched user lookup and we just look it up here.
function resolveTriggeredByName(triggeredBy: string | null, nameByUserId: Map<number, string>): string | null {
  if (!triggeredBy || triggeredBy === 'cron') return null;
  const id = Number(triggeredBy);
  return Number.isFinite(id) ? (nameByUserId.get(id) ?? null) : null;
}

function toDto(job: {
  publicId: string;
  status: string;
  triggeredBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  logs: unknown;
  steps: unknown;
  createdAt: Date;
  durationMsTotal?: number;
  dateRangeFrom?: Date | null;
  dateRangeTo?: Date | null;
}, accounts: JobAccountRow[] = [], nameByUserId: Map<number, string> = new Map()): BankSyncJobDto {
  // durationMsTotal accumulates across retries (each retry resets startedAt, so a
  // naive completedAt - startedAt diff would only reflect the last attempt).
  // Fall back to the raw diff for jobs created before this field existed.
  const durationMs = job.durationMsTotal
    ? job.durationMsTotal
    : job.startedAt && job.completedAt
      ? job.completedAt.getTime() - job.startedAt.getTime()
      : null;

  return {
    id: job.publicId,
    status: job.status,
    triggeredBy: job.triggeredBy,
    triggeredByName: resolveTriggeredByName(job.triggeredBy, nameByUserId),
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    errorMessage: job.errorMessage,
    logs: Array.isArray(job.logs) ? (job.logs as Array<{ time: string; message: string; step?: string }>) : [],
    steps: parseSteps(job.steps),
    createdAt: job.createdAt,
    durationMs,
    stats: computeJobStats(accounts),
    dateRangeFrom: job.dateRangeFrom ?? null,
    dateRangeTo: job.dateRangeTo ?? null,
  };
}

@Injectable()
export class BankStatementService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('bank-sync') private readonly queue: Queue,
    private readonly jobScheduler: JobSchedulerService,
  ) {}

  async onModuleInit() {
    const settings = await this.prisma.bankJobSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (settings) {
      this.jobScheduler.sync('bank-sync', settings.scheduleCron, settings.isScheduled, async () => { await this.triggerJob('cron'); });
    }
  }

  // ─── Currency Rates ───────────────────────────────────────────────────────────

  async getCurrencyRates() {
    return this.prisma.currencyRate.findMany({ orderBy: { currency: 'asc' } });
  }

  // ─── Schedule Settings ───────────────────────────────────────────────────────

  async getSettings() {
    let settings = await this.prisma.bankJobSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!settings) {
      settings = await this.prisma.bankJobSettings.create({
        data: { id: SETTINGS_ID, scheduleCron: '30 9 * * *', isScheduled: true },
      });
    }
    return settings;
  }

  async updateSettings(dto: UpdateSettingsDto) {
    const settings = await this.prisma.bankJobSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...dto },
      update: dto,
    });
    this.jobScheduler.sync('bank-sync', settings.scheduleCron, settings.isScheduled, async () => { await this.triggerJob('cron'); });
    return settings;
  }

  // ─── Download Template ───────────────────────────────────────────────────────

  async getTemplate() {
    return this.prisma.bankDownloadTemplate.findUnique({ where: { name: 'hsbcnet_transaction' } });
  }

  async updateTemplate(dto: UpdateTemplateDto) {
    const headerHash = crypto.createHash('sha256').update(dto.headers.join('|')).digest('hex');
    return this.prisma.bankDownloadTemplate.upsert({
      where: { name: 'hsbcnet_transaction' },
      create: { name: 'hsbcnet_transaction', headers: dto.headers, headerHash },
      update: { headers: dto.headers, headerHash },
    });
  }

  // ─── GSheet Configs ──────────────────────────────────────────────────────────

  async listGsheetConfigs() {
    return this.prisma.bankGsheetConfig.findMany({ orderBy: { accountCode: 'asc' } });
  }

  async upsertGsheetConfig(accountCode: string, dto: UpsertGsheetConfigDto) {
    return this.prisma.bankGsheetConfig.upsert({
      where: { accountCode },
      create: { accountCode, ...dto },
      update: dto,
    });
  }

  // ─── Accounts & Metrics ─────────────────────────────────────────────────────

  // includeDisabled: the Settings page needs to see + re-toggle disabled names, while
  // other consumers (e.g. Metrics filter dropdown) only want the enabled ones.
  async listAccountNames(includeDisabled = false) {
    return this.prisma.bankAccountName.findMany({
      where: includeDisabled ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async listAccounts() {
    const accounts = await this.prisma.bankAccount.findMany({
      include: {
        syncJobAccounts: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { job: { select: { completedAt: true } } },
        },
      },
      orderBy: [{ accountName: 'asc' }, { accountNumber: 'asc' }],
    });
    return accounts.map(a => ({
      id: a.id,
      accountNumber: a.accountNumber,
      accountName: a.accountName,
      bankName: a.bankName,
      currency: a.currency,
      accountCode: a.accountCode,
      isActive: a.isActive,
      syncEnabled: a.syncEnabled,
      lastSyncAt: a.syncJobAccounts[0]?.job?.completedAt ?? null,
      lastSyncStatus: a.syncJobAccounts[0]?.status ?? null,
    }));
  }

  async createAccountName(name: string, accountCode: string) {
    const trimmedName = name.trim();
    const existing = await this.prisma.bankAccountName.findUnique({ where: { name: trimmedName } });
    if (existing) throw new ConflictException('ACCOUNT_NAME_EXISTS');
    return this.prisma.bankAccountName.create({ data: { name: trimmedName, accountCode: accountCode.trim() } });
  }

  // Handles rename and/or the isActive toggle (see [[project-bank-sync-design]]: HSBC
  // decides existence, the user decides sync intent). accountCode is intentionally NOT
  // editable here — it's only set at creation. BankGsheetConfig is joined to an account
  // by the `accountCode` string (not a real FK, see bank_gsheet_configs), so re-coding an
  // existing name would silently orphan an already-configured Google Sheet; simplest safe
  // answer is to never allow it to change post-creation rather than cascade-rename it.
  // Renaming the name does cascade to every existing BankAccount row under it — the
  // Accounts tab groups accounts by matching the denormalized `accountName` string column,
  // not by accountNameId, so leaving those stale would desync counts/grouping until the
  // next HSBC discovery run happens to overwrite them.
  async updateAccountName(id: number, dto: { name?: string; isActive?: boolean }) {
    const existing = await this.prisma.bankAccountName.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('ACCOUNT_NAME_NOT_FOUND');

    const name = dto.name?.trim();
    if (name && name !== existing.name) {
      const dup = await this.prisma.bankAccountName.findUnique({ where: { name } });
      if (dup) throw new ConflictException('ACCOUNT_NAME_EXISTS');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.bankAccountName.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      }),
      ...(name !== undefined
        ? [this.prisma.bankAccount.updateMany({ where: { accountNameId: id }, data: { accountName: name } })]
        : []),
    ]);

    return updated;
  }

  // Blocked when accounts already exist under this name — deleting would violate the
  // required BankAccount.accountNameId FK and orphan real transaction history. Disable
  // (isActive: false) instead if the intent is just to stop syncing it.
  async deleteAccountName(id: number) {
    const existing = await this.prisma.bankAccountName.findUnique({
      where: { id },
      include: { _count: { select: { accounts: true } } },
    });
    if (!existing) throw new NotFoundException('ACCOUNT_NAME_NOT_FOUND');
    if (existing._count.accounts > 0) throw new ConflictException('ACCOUNT_NAME_HAS_ACCOUNTS');
    await this.prisma.bankAccountName.delete({ where: { id } });
    return { ok: true };
  }

  // account-number-level toggle — separate from `isActive`, which HSBC discovery
  // owns and would otherwise silently re-enable on the next successful login.
  async updateAccountSyncEnabled(id: number, syncEnabled: boolean) {
    const account = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('BANK_ACCOUNT_NOT_FOUND');
    return this.prisma.bankAccount.update({ where: { id }, data: { syncEnabled } });
  }

  // Repairs a Sheet that got manually deleted/corrupted — the normal sync only re-pushes
  // when a fresh HSBC download inserts a new DB row, so a since-broken sheet is never
  // retried on its own. Runs as its own queue job (not a full bank_sync_jobs record —
  // there's no download step, just SheetsService.sync() re-sending every stored row).
  // Scoped to rows this job has ever seen (see BankTransaction.jobIds) — covers rows
  // it inserted itself as well as ones it later matched as duplicates of another job's
  // fetch, so it still works even if that other job gets deleted.
  async forceResyncSheets(jobPublicId: string, bankAccountId: number, triggeredBy: string) {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId: jobPublicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');
    const account = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!account) throw new NotFoundException('BANK_ACCOUNT_NOT_FOUND');

    if (await this.hasQueuedResync(bankAccountId)) {
      return { ok: true, alreadyQueued: true };
    }
    await this.queue.add('resync-sheets', { bankAccountId, jobId: job.id, triggeredBy });
    return { ok: true, alreadyQueued: false };
  }

  // Bulk variant — force-resyncs every account that appears in a given job (e.g. after
  // the whole target spreadsheet got deleted/corrupted, not just one account's sheet).
  async forceResyncSheetsForJob(publicId: string, triggeredBy: string) {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');

    const accounts = await this.prisma.bankSyncJobAccount.findMany({
      where: { jobId: job.id },
      select: { bankAccountId: true },
    });
    const toQueue: number[] = [];
    for (const a of accounts) {
      if (!(await this.hasQueuedResync(a.bankAccountId))) toQueue.push(a.bankAccountId);
    }
    await Promise.all(
      toQueue.map(bankAccountId => this.queue.add('resync-sheets', { bankAccountId, jobId: job.id, triggeredBy })),
    );
    return { ok: true, count: toQueue.length, skipped: accounts.length - toQueue.length };
  }

  // sheets.service.ts's sync() always re-appends every row it's given with no dedup —
  // fine for a single repair run, but a second resync queued for the SAME account while
  // the first is still waiting/running would duplicate every row a second time. Check
  // the live queue itself (not a DB flag, which could go stale across worker restarts
  // or crashes) for an already-pending job for this exact account before adding another.
  private async hasQueuedResync(bankAccountId: number): Promise<boolean> {
    const pending = await this.queue.getJobs(['waiting', 'active', 'delayed']);
    return pending.some(
      j => j.name === 'resync-sheets' && (j.data as { bankAccountId?: number }).bankAccountId === bankAccountId,
    );
  }

  async getMetrics(from: Date, to: Date, accountCode?: string, accountId?: number) {
    const accountWhere: Record<string, unknown> = {};
    if (accountCode) accountWhere.accountCode = accountCode;
    if (accountId) accountWhere.id = accountId;

    const accounts = await this.prisma.bankAccount.findMany({
      where: Object.keys(accountWhere).length > 0 ? accountWhere : undefined,
      select: { id: true, accountNumber: true, accountName: true, accountCode: true, currency: true },
    });

    if (accounts.length === 0) {
      return { summary: { totalCredit: 0, totalDebit: 0, netFlow: 0, txCount: 0, accountCount: 0 }, daily: [], balances: [] };
    }

    const accountIds = accounts.map(a => a.id);
    const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));

    const grouped = await this.prisma.bankTransaction.groupBy({
      by: ['bankAccountId', 'postDate'],
      where: { bankAccountId: { in: accountIds }, postDate: { gte: from, lte: to } },
      _sum: { creditAmount: true, debitAmount: true },
      _count: { id: true },
      orderBy: { postDate: 'asc' },
    });

    // Ending balance per account for the selected range — the last transaction's
    // balance snapshot (not a sum, balance is a running bank-reported value, not
    // additive across rows). `distinct` + orderBy desc keeps only the latest row
    // per account. postDate desc picks the most recent day; WITHIN that day the
    // tiebreak must be id ASC, not DESC — same-day rows have a SMALLER id for the
    // chronologically LATER transaction (HSBC exports newest-first, rows are
    // inserted in that same file order — see getAccountTransactions()/sheets.service.ts
    // for the full reasoning), so id ascending surfaces that day's true last row.
    const latestBalanceRows = await this.prisma.bankTransaction.findMany({
      where: { bankAccountId: { in: accountIds }, postDate: { gte: from, lte: to } },
      orderBy: [{ postDate: 'desc' }, { id: 'asc' }],
      distinct: ['bankAccountId'],
      select: { bankAccountId: true, balance: true },
    });
    const balanceByAccount = Object.fromEntries(
      latestBalanceRows.map(r => [r.bankAccountId, r.balance != null ? Number(r.balance) : null]),
    );

    const daily = grouped.map(row => {
      const acc = accountMap[row.bankAccountId];
      return {
        date: (row.postDate as Date).toISOString().split('T')[0],
        accountId: row.bankAccountId,
        accountNumber: acc?.accountNumber ?? '',
        accountName: acc?.accountName ?? '',
        accountCode: acc?.accountCode ?? '',
        currency: acc?.currency ?? '',
        totalCredit: Number(row._sum.creditAmount ?? 0),
        totalDebit: Number(row._sum.debitAmount ?? 0),
        txCount: row._count.id,
      };
    });

    const totalCredit = daily.reduce((s, r) => s + r.totalCredit, 0);
    const totalDebit = daily.reduce((s, r) => s + r.totalDebit, 0);
    return {
      summary: {
        totalCredit,
        totalDebit,
        netFlow: totalCredit + totalDebit,
        txCount: daily.reduce((s, r) => s + r.txCount, 0),
        accountCount: new Set(daily.map(r => r.accountId)).size,
      },
      daily,
      balances: accountIds.map(id => ({ accountId: id, balance: balanceByAccount[id] ?? null })),
    };
  }

  // ─── Sync Coverage Calendar ──────────────────────────────────────────────────
  // There's no per-day table — this derives "was day D fetched / synced" from every
  // BankSyncJob whose actual dateRangeFrom/dateRangeTo overlaps the requested window,
  // cross-referenced with each job's per-account BankSyncJobAccount outcome. Only
  // syncEnabled accounts count (matches the worker's own fetch-loop filter — an
  // account the user disabled shouldn't show the calendar as "missing" forever).
  async getCoverage(from: Date, to: Date) {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { syncEnabled: true, accountNameRef: { isActive: true } },
      select: { id: true, accountNumber: true, accountName: true },
      orderBy: [{ accountName: 'asc' }, { accountNumber: 'asc' }],
    });

    const jobs = await this.prisma.bankSyncJob.findMany({
      where: {
        isDeleted: false,
        dateRangeFrom: { not: null, lte: to },
        dateRangeTo: { not: null, gte: from },
      },
      select: {
        dateRangeFrom: true,
        dateRangeTo: true,
        accountJobs: { select: { bankAccountId: true, status: true, sheetsSyncStatus: true } },
      },
    });

    const now = new Date();
    const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    type DayStatus = 'future' | 'not_fetched' | 'partial' | 'fetched_not_synced' | 'synced' | 'in_progress';
    const days: Array<{
      date: string;
      status: DayStatus;
      accounts: Array<{ id: number; accountNumber: string; accountName: string; downloaded: boolean; synced: boolean }>;
    }> = [];

    for (const cursor = new Date(from); cursor.getTime() <= to.getTime(); cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      const dayDate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()));
      const dateStr = dayDate.toISOString().split('T')[0];

      if (dayDate.getTime() > todayUtc.getTime()) {
        days.push({ date: dateStr, status: 'future', accounts: [] });
        continue;
      }
      // Only today can reach this point unsettled — every earlier day is always
      // settled (HSBC data for it is final), same "settled" concept the worker uses
      // (dateRangeSettled) to decide whether a fetch counts as done for good.
      const settled = dayDate.getTime() < todayUtc.getTime();

      // Jobs overlapping this day can carry account rows for numbers that are no
      // longer in `accounts` (disabled since, or renamed) — a historical multi-day
      // catch-up job may have touched a dozen accounts that used to be enabled.
      // These Sets track EVERY account id seen, not just currently-enabled ones, so
      // downloadedIds.size can run well past accounts.length — comparing that raw
      // size against accounts.length below would then never equal it even when
      // every currently-enabled account is fully done. Count from accountDetails
      // (already scoped to `accounts`) instead of these Sets' raw size.
      const downloadedIds = new Set<number>();
      const syncedIds = new Set<number>();
      for (const job of jobs) {
        if (job.dateRangeFrom! <= dayDate && dayDate <= job.dateRangeTo!) {
          for (const ja of job.accountJobs) {
            if (ja.status === 'completed') downloadedIds.add(ja.bankAccountId);
            if (ja.sheetsSyncStatus === 'completed' || ja.sheetsSyncStatus === 'no_data') syncedIds.add(ja.bankAccountId);
          }
        }
      }

      const accountDetails = accounts.map(a => ({
        id: a.id,
        accountNumber: a.accountNumber,
        accountName: a.accountName,
        downloaded: downloadedIds.has(a.id),
        synced: syncedIds.has(a.id),
      }));
      const downloadedCount = accountDetails.filter(a => a.downloaded).length;
      const syncedCount = accountDetails.filter(a => a.synced).length;

      let status: DayStatus;
      if (accounts.length === 0 || downloadedCount === 0) {
        status = 'not_fetched';
      } else if (!settled) {
        // Today — whatever's been fetched so far is just a mid-day snapshot; more
        // transactions can still post before midnight, so this can never be called
        // "synced"/complete the way a genuinely past day can, even if every enabled
        // account already shows completed this run. Reported separately from
        // 'partial' (which means "some accounts never got attempted at all") —
        // here every account may well be fully attempted, just not fully settled.
        status = 'in_progress';
      } else if (syncedCount === accounts.length) {
        status = 'synced';
      } else if (downloadedCount === accounts.length) {
        status = 'fetched_not_synced';
      } else {
        status = 'partial';
      }

      days.push({ date: dateStr, status, accounts: accountDetails });
    }

    return { days };
  }

  async getAccountTransactions(accountId: number, from: Date, to: Date) {
    const txns = await this.prisma.bankTransaction.findMany({
      where: {
        bankAccountId: accountId,
        postDate: { gte: from, lte: to },
      },
      // Same-day ties broken by id DESC, not ASC — HSBC's export lists rows
      // newest-first, and rows are parsed/inserted in that same file order, so a
      // SMALLER id is actually the NEWER same-day transaction (verified against the
      // balance chain: balance[i-1] + credit[i] - debit[i] === balance[i] only holds
      // when read this way). See sheets.service.ts (worker) for the matching fix on
      // the Google Sheets push side.
      orderBy: [{ postDate: 'asc' }, { id: 'desc' }],
      select: {
        id: true,
        postDate: true,
        narrative: true,
        bankReference: true,
        creditAmount: true,
        debitAmount: true,
        balance: true,
        createdAt: true,
      },
    });
    return txns.map(t => ({
      id: t.id,
      postDate: t.postDate,
      narrative: t.narrative,
      bankReference: t.bankReference,
      creditAmount: t.creditAmount != null ? Number(t.creditAmount) : null,
      debitAmount: t.debitAmount != null ? Number(t.debitAmount) : null,
      balance: t.balance != null ? Number(t.balance) : null,
      fetchedAt: t.createdAt,
    }));
  }

  async getJobAccountTransactions(jobPublicId: string, accountId: number) {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId: jobPublicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');

    const txns = await this.prisma.bankTransaction.findMany({
      where: { jobId: job.id, bankAccountId: accountId },
      // See getAccountTransactions() above for why the same-day tiebreak is id DESC.
      orderBy: [{ postDate: 'asc' }, { id: 'desc' }],
      select: {
        id: true,
        postDate: true,
        narrative: true,
        bankReference: true,
        creditAmount: true,
        debitAmount: true,
        balance: true,
        createdAt: true,
      },
    });

    return txns.map(t => ({
      id: t.id,
      postDate: t.postDate,
      narrative: t.narrative,
      bankReference: t.bankReference,
      creditAmount: t.creditAmount != null ? Number(t.creditAmount) : null,
      debitAmount: t.debitAmount != null ? Number(t.debitAmount) : null,
      balance: t.balance != null ? Number(t.balance) : null,
      fetchedAt: t.createdAt,
    }));
  }

  async getJobStats(jobPublicId: string): Promise<JobStatsDto> {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId: jobPublicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');

    const accounts = await this.prisma.bankSyncJobAccount.findMany({ where: { jobId: job.id } });
    return computeJobStats(accounts) ?? {
      totalAccounts: 0, downloaded: 0, downloadFailed: 0, synced: 0,
      syncFailed: 0, syncSkipped: 0, syncPending: 0, syncNoData: 0,
      totalRowsDownloaded: 0, totalRowsInserted: 0, totalRowsSynced: 0,
    };
  }

  // Based on every currently syncEnabled account (not just ones this job's own
  // BankSyncJobAccount rows cover) — an account added to the master list AFTER this
  // job ran (or one the fetch loop never reached for any other reason) previously
  // vanished from this list with no trace at all, indistinguishable from "doesn't
  // exist". Merging in the full account list and marking the gap 'not_attempted'
  // makes that kind of silent miss visible instead.
  async getJobSummary(jobPublicId: string) {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId: jobPublicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');

    const jobAccounts = await this.prisma.bankSyncJobAccount.findMany({
      where: { jobId: job.id },
      include: {
        bankAccount: { select: { accountNumber: true, accountName: true, accountCode: true, currency: true } },
      },
    });
    const attemptedById = new Map(jobAccounts.map(ja => [ja.bankAccountId, ja]));

    // Same filter as the worker's own fetch loop (bank-sync.service.ts) — the set of
    // accounts a run is CURRENTLY configured to touch.
    const currentAccounts = await this.prisma.bankAccount.findMany({
      where: { syncEnabled: true, accountNameRef: { isActive: true } },
      select: { id: true, accountNumber: true, accountName: true, accountCode: true, currency: true },
      orderBy: [{ accountName: 'asc' }, { accountNumber: 'asc' }],
    });

    // Accounts this job DID attempt but that are no longer syncEnabled/active since
    // (disabled or renamed after the fact) — still part of this job's own history,
    // so keep them too instead of dropping them off the list retroactively.
    const currentIds = new Set(currentAccounts.map(a => a.id));
    const staleAccounts = jobAccounts
      .filter(ja => !currentIds.has(ja.bankAccountId))
      .map(ja => ({
        id: ja.bankAccountId,
        accountNumber: ja.bankAccount.accountNumber,
        accountName: ja.bankAccount.accountName,
        accountCode: ja.bankAccount.accountCode,
        currency: ja.bankAccount.currency,
      }));

    const allAccounts = [...currentAccounts, ...staleAccounts];
    if (allAccounts.length === 0) return [];

    const grouped = await this.prisma.bankTransaction.groupBy({
      by: ['bankAccountId'],
      where: { jobId: job.id },
      _sum: { creditAmount: true, debitAmount: true },
      _count: { id: true },
    });
    const txByAccount = Object.fromEntries(grouped.map(g => [g.bankAccountId, g]));

    return allAccounts.map(a => {
      const ja = attemptedById.get(a.id);
      const tx = txByAccount[a.id];
      return {
        accountId: a.id,
        accountNumber: a.accountNumber,
        accountName: a.accountName,
        accountCode: a.accountCode,
        currency: a.currency,
        txCount: tx?._count.id ?? 0,
        totalCredit: Number(tx?._sum.creditAmount ?? 0),
        totalDebit: Number(tx?._sum.debitAmount ?? 0),
        rowsDuplicate: ja?.rowsDuplicate ?? 0,
        downloadStatus: ja?.status ?? 'not_attempted',
        downloadError: ja?.errorMessage ?? null,
        sheetsSyncStatus: ja?.sheetsSyncStatus ?? 'not_attempted',
        sheetsSyncError: ja?.sheetsSyncError ?? null,
      };
    });
  }

  // ─── Job Management ──────────────────────────────────────────────────────────

  async triggerJob(triggeredBy: string, dateFrom?: string, dateTo?: string): Promise<BankSyncJobDto> {
    if ((dateFrom && !dateTo) || (!dateFrom && dateTo)) {
      throw new BadRequestException('DATE_RANGE_INCOMPLETE');
    }

    const dbRecord = await this.prisma.bankSyncJob.create({
      data: {
        publicId: generateJobPublicId(),
        status: 'pending',
        triggeredBy,
        startedAt: new Date(),
        steps: INITIAL_STEPS,
        // Per-run override only — never written to BankJobSettings, so scheduled
        // cron runs (and future manual runs without an override) keep using the
        // default syncDateMode/syncCustomDays untouched.
        dateFromOverride: dateFrom ? new Date(dateFrom) : null,
        dateToOverride: dateTo ? new Date(dateTo) : null,
      },
    });

    await this.queue.add('run', { jobId: dbRecord.id, triggeredBy });

    return toDto(dbRecord);
  }

  private async nameByUserIdFor(triggeredByValues: (string | null)[]): Promise<Map<number, string>> {
    const userIds = Array.from(new Set(
      triggeredByValues
        .filter((v): v is string => !!v && v !== 'cron')
        .map(Number)
        .filter(Number.isFinite),
    ));
    if (userIds.length === 0) return new Map();

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    return new Map(users.map(u => [u.id, u.name ?? u.email]));
  }

  async listJobs(limit = 50): Promise<BankSyncJobDto[]> {
    const jobs = await this.prisma.bankSyncJob.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    if (jobs.length === 0) return [];

    const accounts = await this.prisma.bankSyncJobAccount.findMany({
      where: { jobId: { in: jobs.map(j => j.id) } },
    });
    const accountsByJob = new Map<number, JobAccountRow[]>();
    for (const a of accounts) {
      const list = accountsByJob.get(a.jobId) ?? [];
      list.push(a);
      accountsByJob.set(a.jobId, list);
    }

    const nameByUserId = await this.nameByUserIdFor(jobs.map(j => j.triggeredBy));

    return jobs.map(job => toDto(job, accountsByJob.get(job.id) ?? [], nameByUserId));
  }

  async getJobDetail(publicId: string): Promise<BankSyncJobDto> {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');
    const accounts = await this.prisma.bankSyncJobAccount.findMany({ where: { jobId: job.id } });
    const nameByUserId = await this.nameByUserIdFor([job.triggeredBy]);
    return toDto(job, accounts, nameByUserId);
  }

  async retryJob(publicId: string, retriedBy: string, stepKey?: StepKey): Promise<BankSyncJobDto> {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');
    if (!['failed', 'completed', 'cancelled'].includes(job.status)) throw new ConflictException('JOB_STILL_ACTIVE');

    const steps = parseSteps(job.steps);

    // Find index to reset from — default to first non-completed step
    let startIdx = 0;
    if (stepKey) {
      startIdx = steps.findIndex(s => s.key === stepKey);
      if (startIdx < 0) throw new NotFoundException('STEP_NOT_FOUND');
    } else {
      const firstIncomplete = steps.findIndex(s => s.status !== 'completed');
      startIdx = firstIncomplete >= 0 ? firstIncomplete : 0;
    }

    // Reset target step and all subsequent ones
    for (let i = startIdx; i < steps.length; i++) {
      steps[i] = { ...steps[i], status: 'pending', startedAt: null, completedAt: null, errorMessage: null };
    }

    const prevLogs = Array.isArray(job.logs) ? job.logs : [];
    const separator = { time: new Date().toISOString(), message: '__RETRY__' };

    const updated = await this.prisma.bankSyncJob.update({
      where: { id: job.id },
      data: {
        status: 'pending',
        errorMessage: null,
        startedAt: new Date(),
        completedAt: null,
        logs: [...prevLogs, separator],
        steps,
        triggeredBy: retriedBy,
      },
    });

    await this.queue.add('run', { jobId: job.id, triggeredBy: retriedBy });

    return toDto(updated);
  }

  async cancelJob(publicId: string): Promise<{ ok: boolean }> {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      throw new ConflictException('JOB_ALREADY_TERMINAL');
    }
    await this.prisma.bankSyncJob.update({
      where: { id: job.id },
      data: { status: 'cancelled', completedAt: new Date() },
    });
    return { ok: true };
  }

  async softDeleteJob(publicId: string): Promise<{ ok: boolean }> {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');
    if (!['completed', 'failed', 'cancelled'].includes(job.status)) {
      throw new ConflictException('JOB_STILL_ACTIVE');
    }
    await this.prisma.bankSyncJob.update({ where: { id: job.id }, data: { isDeleted: true } });
    return { ok: true };
  }
}
