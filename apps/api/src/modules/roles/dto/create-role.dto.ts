import { IsString, MinLength, IsOptional, IsArray, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'Kế toán' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 'Quản lý tài chính' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [String], description: 'UUID của các permission' })
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds!: string[];
}
