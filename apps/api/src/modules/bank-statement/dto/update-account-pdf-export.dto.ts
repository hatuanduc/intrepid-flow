import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateAccountPdfExportDto {
  @ApiProperty({ description: 'Có lấy PDF giao dịch cho account number này hay không' })
  @IsBoolean()
  pdfExportEnabled!: boolean;
}
