import { ApiProperty } from '@nestjs/swagger';

export class NotificationResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() type!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ nullable: true }) body!: string | null;
  @ApiProperty({ nullable: true }) jobPublicId!: string | null;
  @ApiProperty() isRead!: boolean;
  @ApiProperty() createdAt!: Date;
}
