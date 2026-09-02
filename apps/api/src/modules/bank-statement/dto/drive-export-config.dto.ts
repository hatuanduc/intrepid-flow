import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertDriveExportConfigDto {
  @ApiProperty({ example: '1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv' })
  @IsString() @MinLength(1)
  rootFolderId!: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString()
  rootFolderUrl?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class DriveExportConfigResponseDto {
  @ApiProperty() id!: number;
  @ApiProperty() accountCode!: string;
  @ApiProperty() rootFolderId!: string;
  @ApiProperty({ nullable: true }) rootFolderUrl!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() updatedAt!: Date;
}
