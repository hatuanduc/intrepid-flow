import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { IdGeneratorService } from './id-generator.service';
import { JobSchedulerService } from './job-scheduler.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [IdGeneratorService, JobSchedulerService],
  exports: [IdGeneratorService, JobSchedulerService],
})
export class CommonModule {}
