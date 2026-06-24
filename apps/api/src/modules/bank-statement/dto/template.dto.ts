import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class UpdateTemplateDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  headers!: string[];
}

export class TemplateResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: [String] }) headers!: string[];
  @ApiProperty() headerHash!: string;
  @ApiProperty() updatedAt!: Date;
}
