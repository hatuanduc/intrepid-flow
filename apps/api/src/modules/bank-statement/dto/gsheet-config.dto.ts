import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertGsheetConfigDto {
  @ApiProperty({ example: '1h5gC1vqRfPvZ7DANAnAog-u5bDNNbpZRCaVuxAfzyQ0' })
  @IsString() @MinLength(1)
  spreadsheetId!: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  spreadsheetUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  templateSheetName?: string;

  @ApiProperty({ required: false, description: 'Service account JSON key' })
  @IsOptional() @IsString()
  serviceKeyJson?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class GsheetConfigResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() countryCode!: string;
  @ApiProperty() spreadsheetId!: string;
  @ApiProperty({ nullable: true }) spreadsheetUrl!: string | null;
  @ApiProperty({ nullable: true }) templateSheetName!: string | null;
  @ApiProperty() hasServiceKey!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() updatedAt!: Date;
}
