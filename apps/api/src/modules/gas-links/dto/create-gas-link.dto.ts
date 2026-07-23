import { IsString, IsUrl, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGasLinkDto {
  @ApiProperty({ example: 'AR Report VN' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'https://script.google.com/macros/s/xxx/exec' })
  @IsUrl({ require_tld: false })
  url!: string;

  @ApiProperty({ example: '📊' })
  @IsString()
  @MinLength(1)
  icon!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}
