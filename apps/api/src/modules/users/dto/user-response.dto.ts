import { ApiProperty } from '@nestjs/swagger';

export class RoleSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() name!: string;
}

export class PermissionSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() module!: string;
  @ApiProperty() action!: string;
  @ApiProperty() label!: string;
}

export class UserResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ nullable: true }) name!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ nullable: true }) lastLoginAt!: string | null;
  @ApiProperty({ type: [RoleSummaryDto] }) roles!: RoleSummaryDto[];
  @ApiProperty({ type: [PermissionSummaryDto] }) permissions!: PermissionSummaryDto[];
}
