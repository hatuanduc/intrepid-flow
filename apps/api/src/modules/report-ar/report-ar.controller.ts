import { Controller, Get, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { HasPermission } from '../../common/decorators/has-permission.decorator';
import { ReportArService } from './report-ar.service';
import { UpdateArSettingsDto } from './dto/update-settings.dto';
import { UpsertArGsheetConfigDto } from './dto/upsert-gsheet-config.dto';

@ApiTags('Report AR')
@ApiBearerAuth()
@Controller('management/report-ar')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReportArController {
  constructor(private readonly service: ReportArService) {}

  // ─── Settings ─────────────────────────────────────────────────────────────

  @Get('settings')
  @HasPermission('report_ar:config')
  @ApiOperation({ summary: 'Lấy cài đặt AR Report' })
  getSettings() {
    return this.service.getSettings();
  }

  @Put('settings')
  @HasPermission('report_ar:config')
  @ApiOperation({ summary: 'Cập nhật cài đặt AR Report' })
  updateSettings(@Body() body: UpdateArSettingsDto) {
    return this.service.updateSettings(body);
  }

  // ─── GSheet Configs ────────────────────────────────────────────────────────

  @Get('settings/gsheets')
  @HasPermission('report_ar:config')
  @ApiOperation({ summary: 'Danh sách gsheet configs' })
  listGsheets() {
    return this.service.listGsheets();
  }

  @Put('settings/gsheets/:countryCode')
  @HasPermission('report_ar:config')
  @ApiOperation({ summary: 'Upsert gsheet config cho một country' })
  upsertGsheet(@Param('countryCode') countryCode: string, @Body() body: UpsertArGsheetConfigDto) {
    return this.service.upsertGsheet(countryCode.toUpperCase(), body);
  }

  // ─── Data ──────────────────────────────────────────────────────────────────

  @Get('data')
  @HasPermission('report_ar:view')
  @ApiOperation({ summary: 'Tải và xử lý dữ liệu AR từ Google Sheets' })
  @ApiQuery({ name: 'country', required: false, example: 'TH' })
  @ApiQuery({ name: 'bizClass', required: false, example: 'B2B Retail' })
  getData(
    @Query('country') country: string = 'TH',
    @Query('bizClass') bizClass?: string,
  ) {
    return this.service.getData(country.toUpperCase(), bizClass?.trim() || undefined);
  }
}
