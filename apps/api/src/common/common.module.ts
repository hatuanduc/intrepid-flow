import { Module } from '@nestjs/common';
import { IdGeneratorService } from './id-generator.service';

@Module({
  providers: [IdGeneratorService],
  exports: [IdGeneratorService],
})
export class CommonModule {}
