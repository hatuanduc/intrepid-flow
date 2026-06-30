import { Module } from '@nestjs/common';
import { ReportArController } from './report-ar.controller';
import { ReportArService } from './report-ar.service';

@Module({
  controllers: [ReportArController],
  providers: [ReportArService],
  exports: [ReportArService],
})
export class ReportArModule {}
