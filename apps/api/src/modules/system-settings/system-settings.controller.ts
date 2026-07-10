import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { HasPermission } from '../../common/decorators/has-permission.decorator';
import { SystemSettingsService } from './system-settings.service';
import { UpdateCurrencySettingsDto } from './dto/currency.dto';

class UpdateServiceAccountDto {
  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsString()
  serviceKeyJson!: string | null;
}

class AddCurrencyRateDto {
  @ApiProperty({ example: 'PHP' })
  @IsString() @MinLength(3) @MaxLength(3)
  currency!: string;
}

@ApiTags('System Settings')
@ApiBearerAuth()
@Controller('management/settings/system')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  // ─── Google Service Account ─────────────────────────────────────────────────

  @Get()
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Get system settings status' })
  async getSettings() { return this.service.getSettings(); }

  @Put('service-account')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Update global Google service account' })
  async updateServiceAccount(@Body() body: UpdateServiceAccountDto) {
    return this.service.updateServiceAccount(body.serviceKeyJson ?? null);
  }

  // ─── Currency Rates ─────────────────────────────────────────────────────────

  @Get('currency-rates')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Get currency rates and settings' })
  async getCurrencyData() { return this.service.getCurrencyData(); }

  @Post('currency-rates/refresh')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Manually refresh all currency rates from frankfurter.app' })
  async refreshCurrencyRates() { return this.service.refreshCurrencyRates(); }

  @Post('currency-rates')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Add a specific currency rate' })
  async addCurrencyRate(@Body() body: AddCurrencyRateDto) {
    return this.service.addCurrencyRate(body.currency);
  }

  @Delete('currency-rates/:currency')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Remove a currency rate' })
  async deleteCurrencyRate(@Param('currency') currency: string) {
    return this.service.deleteCurrencyRate(currency);
  }

  @Put('currency-settings')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Update currency auto-update schedule' })
  async updateCurrencySettings(@Body() body: UpdateCurrencySettingsDto) {
    return this.service.updateCurrencySettings(body);
  }
}
