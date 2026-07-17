import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class TriggerJobDto {
  @ApiProperty({ required: false, description: 'Ghi đè khoảng ngày cho riêng lần chạy này (ISO date). Bỏ trống để dùng cấu hình mặc định (syncDateMode/syncCustomDays).' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiProperty({ required: false, description: 'Ngày kết thúc — bắt buộc nếu có dateFrom.' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
