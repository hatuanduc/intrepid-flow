import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { HasPermission } from '../../common/decorators/has-permission.decorator';
import { SystemSettingsService } from './system-settings.service';
import { CreateCountryDto, UpdateCountryDto } from './dto/country.dto';
import { UpdateCurrencySettingsDto } from './dto/currency.dto';

class UpdateServiceAccountDto {
  @ApiProperty({ nullable: true })
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

  // ─── Countries ──────────────────────────────────────────────────────────────

  @Get('countries')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'List all countries' })
  async listCountries() { return this.service.listCountries(); }

  @Post('countries')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Add a country' })
  async createCountry(@Body() body: CreateCountryDto) { return this.service.createCountry(body); }

  @Put('countries/:code')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Update a country' })
  async updateCountry(@Param('code') code: string, @Body() body: UpdateCountryDto) {
    return this.service.updateCountry(code, body);
  }

  @Delete('countries/:code')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Delete a country' })
  async deleteCountry(@Param('code') code: string) { return this.service.deleteCountry(code); }

  // ─── Currency Rates ─────────────────────────────────────────────────────────

  @Get('currency-rates')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Get currency rates and settings' })
  async getCurrencyData() { return this.service.getCurrencyData(); }

  @Post('currency-rates/refresh')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Manually refresh all currency rates from frankfurter.app' })
  async refreshCurrencyRates() { return this.service.refreshCurrencyRates(); }

  @Put('currency-settings')
  @HasPermission('system:config')
  @ApiOperation({ summary: 'Update currency auto-update schedule' })
  async updateCurrencySettings(@Body() body: UpdateCurrencySettingsDto) {
    return this.service.updateCurrencySettings(body);
  }
}
