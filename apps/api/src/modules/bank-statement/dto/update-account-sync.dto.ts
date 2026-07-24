import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateAccountSyncDto {
  @ApiProperty({ description: 'Có đồng bộ account number này hay không' })
  @IsBoolean()
  syncEnabled!: boolean;
}
