import { Module } from '@nestjs/common';
import { GasLinksService } from './gas-links.service';
import { GasLinksController } from './gas-links.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GasLinksController],
  providers: [GasLinksService],
})
export class GasLinksModule {}
