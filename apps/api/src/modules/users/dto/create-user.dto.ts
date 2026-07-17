import { IsEmail, IsOptional, IsString, IsArray, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Nguyễn Văn A', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ type: [Number], description: 'ID của các role' })
  @IsArray()
  @IsInt({ each: true })
  roleIds!: number[];

  @ApiProperty({ type: [Number], description: 'ID của các quyền tùy chỉnh gán riêng cho user', required: false })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  permissionIds?: number[];
}
