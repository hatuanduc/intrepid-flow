import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class FilterMergeDto {
  @ApiPropertyOptional({ example: 'service_invoices_merged.xlsx', description: 'Mặc định "service_invoices_merged.xlsx" nếu không truyền' })
  @IsOptional()
  @IsString()
  outputFileName?: string;
}
