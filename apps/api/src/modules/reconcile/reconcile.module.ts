import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ReconcileController } from './reconcile.controller';
import { ReconcileService } from './reconcile.service';

@Module({
  imports: [PrismaModule],
  controllers: [ReconcileController],
  providers: [ReconcileService],
})
export class ReconcileModule {}
