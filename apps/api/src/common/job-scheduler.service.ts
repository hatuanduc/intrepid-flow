import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

@Injectable()
export class JobSchedulerService {
  private readonly logger = new Logger(JobSchedulerService.name);

  constructor(private readonly schedulerRegistry: SchedulerRegistry) {}

  sync(name: string, cron: string, enabled: boolean, callback: () => void | Promise<void>) {
    try { this.schedulerRegistry.deleteCronJob(name); } catch { /* not yet registered */ }

    if (!enabled) {
      this.logger.log(`Schedule '${name}' disabled`);
      return;
    }

    const job = new CronJob(cron, () => {
      Promise.resolve(callback()).catch(err =>
        this.logger.error(`Schedule '${name}' failed: ${(err as Error).message}`)
      );
    });
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
    this.logger.log(`Schedule '${name}' registered: ${cron}`);
  }
}
