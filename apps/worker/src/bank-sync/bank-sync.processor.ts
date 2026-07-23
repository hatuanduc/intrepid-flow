import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BANK_SYNC_QUEUE } from './constants';
import { BankSyncService } from './bank-sync.service';

export type BankSyncJobData = {
  jobId: number;       // bank_sync_jobs.id
  triggeredBy: string; // user_id or 'cron'
};

export type ResyncSheetsJobData = {
  bankAccountId: number;
  jobId: number;        // bank_sync_jobs.id — scope to this job's own rows only
  triggeredBy: string;  // user_id
};

@Processor(BANK_SYNC_QUEUE)
export class BankSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(BankSyncProcessor.name);

  constructor(private readonly bankSyncService: BankSyncService) {
    super();
  }

  async process(job: Job<BankSyncJobData | ResyncSheetsJobData>): Promise<void> {
    if (job.name === 'resync-sheets') {
      const { bankAccountId, jobId: syncJobId } = job.data as ResyncSheetsJobData;
      this.logger.log(`Processing resync-sheets for account ${bankAccountId} (job ${syncJobId})`);
      await this.bankSyncService.forceResyncSheets(bankAccountId, syncJobId);
      return;
    }

    const { jobId } = job.data as BankSyncJobData;
    this.logger.log(`Processing job ${jobId}`);
    try {
      await this.bankSyncService.run(jobId);
    } catch (err) {
      this.logger.error(`Job ${jobId} failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
