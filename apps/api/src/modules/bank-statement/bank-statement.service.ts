import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/settings.dto';
import { UpdateTemplateDto } from './dto/template.dto';
import { CreateCountryMappingDto, UpdateCountryMappingDto } from './dto/country-mapping.dto';
import { UpsertGsheetConfigDto } from './dto/gsheet-config.dto';

const SETTINGS_ID = 'default';

export type BankSyncJobDto = {
  id: string;
  status: string;
  triggeredBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  logs: Array<{ time: string; message: string }>;
  createdAt: Date;
  durationMs: number | null;
};

function toDto(job: {
  id: string;
  status: string;
  triggeredBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  logs: unknown;
  createdAt: Date;
}): BankSyncJobDto {
  const durationMs =
    job.startedAt && job.completedAt
      ? job.completedAt.getTime() - job.startedAt.getTime()
      : null;

  return {
    id: job.id,
    status: job.status,
    triggeredBy: job.triggeredBy,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    errorMessage: job.errorMessage,
    logs: Array.isArray(job.logs) ? (job.logs as Array<{ time: string; message: string }>) : [],
    createdAt: job.createdAt,
    durationMs,
  };
}

@Injectable()
export class BankStatementService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('bank-sync') private readonly queue: Queue,
  ) {}

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
    return this.prisma.bankJobSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...dto },
      update: dto,
    });
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

  // ─── Country Mappings ────────────────────────────────────────────────────────

  async listCountryMappings() {
    return this.prisma.bankCountryMapping.findMany({ orderBy: { companyName: 'asc' } });
  }

  async createCountryMapping(dto: CreateCountryMappingDto) {
    return this.prisma.bankCountryMapping.create({ data: dto });
  }

  async updateCountryMapping(id: string, dto: UpdateCountryMappingDto) {
    const existing = await this.prisma.bankCountryMapping.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('COUNTRY_MAPPING_NOT_FOUND');
    return this.prisma.bankCountryMapping.update({ where: { id }, data: dto });
  }

  async deleteCountryMapping(id: string) {
    const existing = await this.prisma.bankCountryMapping.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('COUNTRY_MAPPING_NOT_FOUND');
    await this.prisma.bankCountryMapping.delete({ where: { id } });
    return { ok: true };
  }

  // ─── GSheet Configs ──────────────────────────────────────────────────────────

  async listGsheetConfigs() {
    const configs = await this.prisma.bankGsheetConfig.findMany({ orderBy: { countryCode: 'asc' } });
    return configs.map(c => ({ ...c, hasServiceKey: !!c.serviceKeyJson, serviceKeyJson: undefined }));
  }

  async upsertGsheetConfig(countryCode: string, dto: UpsertGsheetConfigDto) {
    const result = await this.prisma.bankGsheetConfig.upsert({
      where: { countryCode },
      create: { countryCode, ...dto },
      update: dto,
    });
    return { ...result, hasServiceKey: !!result.serviceKeyJson, serviceKeyJson: undefined };
  }

  // ─── Job Management ──────────────────────────────────────────────────────────

  async triggerJob(triggeredBy: string): Promise<BankSyncJobDto> {
    const dbRecord = await this.prisma.bankSyncJob.create({
      data: {
        status: 'pending',
        triggeredBy,
        startedAt: new Date(),
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
    return jobs.map(toDto);
  }

  async getJobDetail(id: string): Promise<BankSyncJobDto> {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');
    return toDto(job);
  }

  async softDeleteJob(id: string): Promise<{ ok: boolean }> {
    const job = await this.prisma.bankSyncJob.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('JOB_NOT_FOUND');
    if (!['completed', 'failed'].includes(job.status)) {
      throw new NotFoundException('JOB_STILL_ACTIVE');
    }
    await this.prisma.bankSyncJob.update({ where: { id }, data: { isDeleted: true } });
    return { ok: true };
  }
}
