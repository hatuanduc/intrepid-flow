import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, Length, Matches } from 'class-validator';

export class CreateCountryDto {
  @ApiProperty({ example: 'HK' })
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Za-z]{2}$/)
  code!: string;

  @ApiProperty({ example: 'Hong Kong' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'HKD' })
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;
}

export class UpdateCountryDto {
  @ApiProperty({ example: 'Hong Kong', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'HKD', required: false })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
