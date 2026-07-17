import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BANK_SYNC_QUEUE } from './constants';
import { BankSyncService } from './bank-sync.service';

export type BankSyncJobData = {
  jobId: number;       // bank_sync_jobs.id
  triggeredBy: string; // user_id or 'cron'
};

@Processor(BANK_SYNC_QUEUE)
export class BankSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(BankSyncProcessor.name);

  constructor(private readonly bankSyncService: BankSyncService) {
    super();
  }

  async process(job: Job<BankSyncJobData>): Promise<void> {
    this.logger.log(`Processing job ${job.data.jobId}`);
    try {
      await this.bankSyncService.run(job.data.jobId);
    } catch (err) {
      this.logger.error(`Job ${job.data.jobId} failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
