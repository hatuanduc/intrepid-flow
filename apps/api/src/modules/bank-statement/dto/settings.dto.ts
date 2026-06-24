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
  @IsOptional()
  @IsString()
  hsbcnetUsername?: string | null;
}

export class SettingsResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() scheduleCron!: string;
  @ApiProperty() isScheduled!: boolean;
  @ApiProperty({ nullable: true }) hsbcnetUsername!: string | null;
}
