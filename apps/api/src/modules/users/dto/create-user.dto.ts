import { IsEmail, IsOptional, IsString, IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Nguyễn Văn A', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ type: [String], description: 'UUID của các role' })
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds!: string[];
}
