import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateArGsheetConfigDto {
  @ApiProperty({ example: 'TH' })
  @IsString() @MinLength(1)
  countryCode!: string;

  @ApiProperty({ example: '1wQFumTUIQCKs2fR4Q4q3xVR4a8QIGYPjcJ1LLcs6bNw' })
  @IsString() @MinLength(1)
  spreadsheetId!: string;

  @ApiProperty({ example: 'TH' })
  @IsString() @MinLength(1)
  sheetName!: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  spreadsheetUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class UpdateArGsheetConfigDto {
  @ApiProperty({ example: 'TH', required: false })
  @IsOptional() @IsString() @MinLength(1)
  countryCode?: string;

  @ApiProperty({ example: '1wQFumTUIQCKs2fR4Q4q3xVR4a8QIGYPjcJ1LLcs6bNw' })
  @IsString() @MinLength(1)
  spreadsheetId!: string;

  @ApiProperty({ example: 'TH' })
  @IsString() @MinLength(1)
  sheetName!: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  spreadsheetUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class ArGsheetConfigResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() countryCode!: string;
  @ApiProperty() spreadsheetId!: string;
  @ApiProperty() sheetName!: string;
  @ApiProperty({ nullable: true }) spreadsheetUrl!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() updatedAt!: Date;
}
