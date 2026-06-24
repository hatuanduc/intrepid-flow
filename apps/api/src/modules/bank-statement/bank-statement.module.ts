import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BankStatementController } from './bank-statement.controller';
import { BankStatementService } from './bank-statement.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => ({
        connection: {
          host: process.env.REDIS_HOST ?? 'localhost',
          port: Number(process.env.REDIS_PORT ?? 6379),
        },
      }),
    }),
    BullModule.registerQueue({ name: 'bank-sync' }),
  ],
  controllers: [BankStatementController],
  providers: [BankStatementService],
  exports: [BankStatementService],
})
export class BankStatementModule {}
