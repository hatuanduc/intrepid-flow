import { ApiProperty } from '@nestjs/swagger';

export class PermissionItem {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() module!: string;
  @ApiProperty() action!: string;
  @ApiProperty() label!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
}
