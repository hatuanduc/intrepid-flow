import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateAccountNameDto {
  @ApiPropertyOptional({ example: 'INTREPID ECOMMERCE SERVICES' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ example: 'TH' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  accountCode?: string;

  @ApiPropertyOptional({ description: 'Có tiếp tục đồng bộ mọi account number thuộc account name này hay không' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
