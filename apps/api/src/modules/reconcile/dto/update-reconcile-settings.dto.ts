import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class UpdateReconcileSettingsDto {
  @ApiProperty({ example: 1, description: 'Dòng tiêu đề trong các file hóa đơn (1-based)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  headerRow!: number;

  @ApiProperty({ example: 'Doanh số bán chưa thuế VNĐ' })
  @IsString() @MinLength(1)
  salesColumn!: string;

  @ApiProperty({ example: 'Thuế GTGT đầu ra VNĐ' })
  @IsString() @MinLength(1)
  taxColumn!: string;

  @ApiProperty({ example: 'Ghi chú' })
  @IsString() @MinLength(1)
  noteColumn!: string;

  @ApiProperty({ example: 'Tên khách hàng' })
  @IsString() @MinLength(1)
  customerColumn!: string;
}
