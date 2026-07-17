import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';

export class UpdateCurrencySettingsDto {
  @ApiProperty({ example: 1, description: 'Day of month (1-28) to auto-refresh rates' })
  @IsInt()
  @Min(1)
  @Max(28)
  autoUpdateDay!: number;
}
