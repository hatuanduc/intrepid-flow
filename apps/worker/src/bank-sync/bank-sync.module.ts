import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BANK_SYNC_QUEUE } from './constants';
import { BankSyncProcessor } from './bank-sync.processor';
import { BankSyncService } from './bank-sync.service';
import { PlaywrightService } from './services/playwright.service';
import { ExcelService } from './services/excel.service';
import { SheetsService } from './services/sheets.service';

@Module({
  imports: [BullModule.registerQueue({ name: BANK_SYNC_QUEUE })],
  providers: [
    BankSyncProcessor,
    BankSyncService,
    PlaywrightService,
    ExcelService,
    SheetsService,
  ],
})
export class BankSyncModule {}
