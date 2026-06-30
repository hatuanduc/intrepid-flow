import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateArSettingsDto {
  @ApiProperty({ required: false, description: 'Google Service Account JSON key' })
  @IsOptional() @IsString()
  googleServiceKeyJson?: string | null;
}

export class ArSettingsResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() hasServiceKey!: boolean;
  @ApiProperty() updatedAt!: Date;
}
