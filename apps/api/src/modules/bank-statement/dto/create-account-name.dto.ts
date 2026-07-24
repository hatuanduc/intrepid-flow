import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateAccountNameDto {
  @ApiProperty({ example: 'INTREPID ECOMMERCE SERVICES' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'TH' })
  @IsString()
  @MinLength(1)
  accountCode!: string;
}
