import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReplaceMasterCustomerDto {
  @ApiPropertyOptional({ example: 'Brand name', description: 'Mặc định "Brand name" nếu không truyền' })
  @IsOptional()
  @IsString()
  brandColumn?: string;

  @ApiPropertyOptional({ example: 'Customer name', description: 'Mặc định "Customer name" nếu không truyền' })
  @IsOptional()
  @IsString()
  customerColumn?: string;
}
