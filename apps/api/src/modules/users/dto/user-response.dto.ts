import { ApiProperty } from '@nestjs/swagger';

export class RoleSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() name!: string;
}

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true }) name!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ type: [RoleSummaryDto] }) roles!: RoleSummaryDto[];
}
