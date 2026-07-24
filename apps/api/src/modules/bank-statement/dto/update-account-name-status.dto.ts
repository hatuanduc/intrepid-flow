import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateAccountNameStatusDto {
  @ApiProperty({ description: 'Có tiếp tục đồng bộ mọi account number thuộc account name này hay không' })
  @IsBoolean()
  isActive!: boolean;
}
