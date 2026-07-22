import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GoogleLoginDto {
  @ApiProperty({ description: 'Google ID token (GIS credential)' })
  @IsString()
  @MinLength(1)
  credential!: string;
}
