import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCountryMappingDto {
  @ApiProperty({ example: 'INTREPID VIETNAM LTD' })
  @IsString() @MinLength(1)
  companyName!: string;

  @ApiProperty({ example: 'VN' })
  @IsString() @MinLength(1)
  accountCode!: string;
}

export class UpdateCountryMappingDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MinLength(1)
  companyName?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() @MinLength(1)
  accountCode?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class CountryMappingResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() companyName!: string;
  @ApiProperty() accountCode!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: Date;
}
