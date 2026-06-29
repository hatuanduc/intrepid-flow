import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class RetryJobDto {
  @ApiProperty({ required: false, enum: ['bank_sync', 'sheets_sync'], description: 'Retry từ step cụ thể. Mặc định: step đầu tiên chưa completed.' })
  @IsOptional()
  @IsIn(['bank_sync', 'sheets_sync'])
  stepKey?: 'bank_sync' | 'sheets_sync';
}
