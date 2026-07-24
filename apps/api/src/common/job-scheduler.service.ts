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

    // Without an explicit timeZone, `cron` interprets the cron string in the server's
    // OS timezone (UTC on our EC2 instances) — not the "ICT (UTC+7)" the settings UI
    // labels it as. Pinning it here keeps "Run at HH:mm" meaning HH:mm Vietnam time
    // regardless of what timezone the underlying server actually runs in.
    const job = new CronJob(cron, () => {
      Promise.resolve(callback()).catch(err =>
        this.logger.error(`Schedule '${name}' failed: ${(err as Error).message}`)
      );
    }, null, false, 'Asia/Ho_Chi_Minh');
    this.schedulerRegistry.addCronJob(name, job);
    job.start();
    this.logger.log(`Schedule '${name}' registered: ${cron}`);
  }
}
