import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { HasPermission } from '../../common/decorators/has-permission.decorator';
import { SystemSettingsService } from './system-settings.service';

class UpdateServiceAccountDto {
  @ApiProperty({ nullable: true, description: 'Google service account JSON string' })
  @IsOptional()
  @IsString()
  serviceKeyJson!: string | null;
}

@ApiTags('System Settings')
@ApiBearerAuth()
@Controller('management/settings/system')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get()
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Get system settings (service account status)' })
  async getSettings() {
    return this.service.getSettings();
  }

  @Put('service-account')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Update global Google service account' })
  async updateServiceAccount(@Body() body: UpdateServiceAccountDto) {
    return this.service.updateServiceAccount(body.serviceKeyJson ?? null);
  }
}
