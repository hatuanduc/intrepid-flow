import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class FilterMergeDto {
  @ApiProperty({ example: 'service_invoices_merged.xlsx' })
  @IsString() @MinLength(1)
  outputFileName!: string;
}
