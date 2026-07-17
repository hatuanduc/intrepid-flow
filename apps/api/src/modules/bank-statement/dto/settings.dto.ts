import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export const SYNC_DATE_MODES = ['today', 'yesterday', 'last_7_days', 'custom'] as const;
export type SyncDateMode = (typeof SYNC_DATE_MODES)[number];

export class UpdateSettingsDto {
  @ApiProperty({ example: '30 9 * * *' })
  @IsString()
  @Matches(/^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/)
  scheduleCron!: string;

  @ApiProperty()
  @IsBoolean()
  isScheduled!: boolean;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsString()
  hsbcnetUsername?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsString()
  googleTemplateSpreadsheetId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsString()
  googleTemplateSheet?: string | null;

  @ApiProperty({ enum: SYNC_DATE_MODES, default: 'yesterday' })
  @IsString() @IsIn(SYNC_DATE_MODES)
  syncDateMode!: SyncDateMode;

  @ApiProperty({ description: 'When syncDateMode is "custom": sync from D-N to D', default: 1 })
  @IsInt() @Min(1)
  syncCustomDays!: number;
}

export class SettingsResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() scheduleCron!: string;
  @ApiProperty() isScheduled!: boolean;
  @ApiProperty({ nullable: true }) hsbcnetUsername!: string | null;
  @ApiProperty({ nullable: true }) googleTemplateSpreadsheetId!: string | null;
  @ApiProperty({ nullable: true }) googleTemplateSheet!: string | null;
  @ApiProperty({ enum: SYNC_DATE_MODES }) syncDateMode!: SyncDateMode;
  @ApiProperty() syncCustomDays!: number;
}
