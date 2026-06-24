import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

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
  googleServiceKeyJson?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsString()
  googleTemplateSpreadsheetId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional() @IsString()
  googleTemplateSheet?: string | null;
}

export class SettingsResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() scheduleCron!: string;
  @ApiProperty() isScheduled!: boolean;
  @ApiProperty({ nullable: true }) hsbcnetUsername!: string | null;
  @ApiProperty({ nullable: true }) googleServiceKeyJson!: string | null;
  @ApiProperty({ nullable: true }) googleTemplateSpreadsheetId!: string | null;
  @ApiProperty({ nullable: true }) googleTemplateSheet!: string | null;
}
