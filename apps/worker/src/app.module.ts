import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BankSyncModule } from './bank-sync/bank-sync.module';
import { BANK_SYNC_QUEUE } from './bank-sync/constants';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379'),
      },
    }),
    BullModule.registerQueue({ name: BANK_SYNC_QUEUE }),
    BankSyncModule,
  ],
})
export class AppModule {}
