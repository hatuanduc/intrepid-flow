import { Injectable, NotFoundException, ConflictException, OnModuleInit } from '@nestjs/common';
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
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  logs: Array<{ time: string; message: string; step?: string }>;
  steps: JobStep[];
  createdAt: Date;
  durationMs: number | null;
  stats: JobStatsDto | null;
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
    syncSkipped: accounts.filter(a => a.sheetsSyncStatus === 'skipped').length,
    syncPending: accounts.filter(a => a.sheetsSyncStatus === 'pending').length,
    syncNoData: accounts.filter(a => a.sheetsSyncStatus === 'no_data').length,
    totalRowsDownloaded: accounts.reduce((s, a) => s + a.rowsDownloaded, 0),
    totalRowsInserted: accounts.reduce((s, a) => s + a.rowsInserted, 0),
    totalRowsSynced: accounts.reduce((s, a) => s + a.rowsSynced, 0),
  };
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
}, accounts: JobAccountRow[] = []): BankSyncJobDto {
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
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    errorMessage: job.errorMessage,
    logs: Array.isArray(job.logs) ? (job.logs as Array<{ time: string; message: string; step?: string }>) : [],
    steps: parseSteps(job.steps),
    createdAt: job.createdAt,
    durationMs,
    stats: computeJobStats(accounts),
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

  async listAccountNames() {
    return this.prisma.bankAccountName.findMany({
      where: { isActive: true },
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
      lastSyncAt: a.syncJobAccounts[0]?.job?.completedAt ?? null,
      lastSyncStatus: a.syncJobAccounts[0]?.status ?? null,
    }));
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
      return { summary: { totalCredit: 0, totalDebit: 0, netFlow: 0, txCount: 0, accountCount: 0 }, daily: [] };
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
        netFlow: totalCredit - totalDebit,
        txCount: daily.reduce((s, r) => s + r.txCount, 0),
        accountCount: new Set(daily.map(r => r.accountId)).size,
      },
      daily,
    };
  }

  async getAccountTransactions(accountId: number, from: Date, to: Date) {
    const txns = await this.prisma.bankTransaction.findMany({
      where: {
        bankAccountId: accountId,
        postDate: { gte: from, lte: to },
      },
      orderBy: { postDate: 'asc' },
      select: {
        id: true,
        postDate: true,
        narrative: true,
        bankReference: true,
        creditAmount: true,
        debitAmount: true,
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
      fetchedAt: t.createdAt,
    }));
  }

  async getJobAccountTransactions(jobPublicId: string, accountId: number) {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId: jobPublicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');

    const txns = await this.prisma.bankTransaction.findMany({
      where: { jobId: job.id, bankAccountId: accountId },
      orderBy: { postDate: 'asc' },
      select: {
        id: true,
        postDate: true,
        narrative: true,
        bankReference: true,
        creditAmount: true,
        debitAmount: true,
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

  async getJobSummary(jobPublicId: string) {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId: jobPublicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');

    const grouped = await this.prisma.bankTransaction.groupBy({
      by: ['bankAccountId'],
      where: { jobId: job.id },
      _sum: { creditAmount: true, debitAmount: true },
      _count: { id: true },
    });

    if (grouped.length === 0) return [];

    const accountMap = Object.fromEntries(
      (await this.prisma.bankAccount.findMany({
        where: { id: { in: grouped.map(g => g.bankAccountId) } },
        select: { id: true, accountNumber: true, accountName: true, accountCode: true, currency: true },
      })).map(a => [a.id, a]),
    );

    const syncStatusMap = Object.fromEntries(
      (await this.prisma.bankSyncJobAccount.findMany({
        where: { jobId: job.id, bankAccountId: { in: grouped.map(g => g.bankAccountId) } },
        select: { bankAccountId: true, sheetsSyncStatus: true, sheetsSyncError: true },
      })).map(a => [a.bankAccountId, a]),
    );

    return grouped.map(row => {
      const acc = accountMap[row.bankAccountId];
      const syncStatus = syncStatusMap[row.bankAccountId];
      return {
        accountId: row.bankAccountId,
        accountNumber: acc?.accountNumber ?? '',
        accountName: acc?.accountName ?? '',
        accountCode: acc?.accountCode ?? '',
        currency: acc?.currency ?? '',
        txCount: row._count.id,
        totalCredit: Number(row._sum.creditAmount ?? 0),
        totalDebit: Number(row._sum.debitAmount ?? 0),
        sheetsSyncStatus: syncStatus?.sheetsSyncStatus ?? 'pending',
        sheetsSyncError: syncStatus?.sheetsSyncError ?? null,
      };
    });
  }

  // ─── Job Management ──────────────────────────────────────────────────────────

  async triggerJob(triggeredBy: string): Promise<BankSyncJobDto> {
    const dbRecord = await this.prisma.bankSyncJob.create({
      data: {
        publicId: generateJobPublicId(),
        status: 'pending',
        triggeredBy,
        startedAt: new Date(),
        steps: INITIAL_STEPS,
      },
    });

    await this.queue.add('run', { jobId: dbRecord.id, triggeredBy });

    return toDto(dbRecord);
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

    return jobs.map(job => toDto(job, accountsByJob.get(job.id) ?? []));
  }

  async getJobDetail(publicId: string): Promise<BankSyncJobDto> {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');
    const accounts = await this.prisma.bankSyncJobAccount.findMany({ where: { jobId: job.id } });
    return toDto(job, accounts);
  }

  async retryJob(publicId: string, retriedBy: string, stepKey?: StepKey): Promise<BankSyncJobDto> {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');
    if (!['failed', 'completed'].includes(job.status)) throw new ConflictException('JOB_STILL_ACTIVE');

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

  async softDeleteJob(publicId: string): Promise<{ ok: boolean }> {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { publicId } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');
    if (!['completed', 'failed'].includes(job.status)) {
      throw new NotFoundException('JOB_STILL_ACTIVE');
    }
    await this.prisma.bankSyncJob.update({ where: { id: job.id }, data: { isDeleted: true } });
    return { ok: true };
  }
}
