import { ApiProperty } from '@nestjs/swagger';
import { PermissionItem } from '../../../modules/permissions/dto/permission-response.dto';

export class RoleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty() isSystem!: boolean;
  @ApiProperty() userCount!: number;
  @ApiProperty({ type: [PermissionItem] }) permissions!: PermissionItem[];
}
