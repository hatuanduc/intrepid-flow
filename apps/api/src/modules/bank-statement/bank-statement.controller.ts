import {
  Controller, Get, Put, Post, Delete, Query,
  Body, Param, UseGuards, Req, Sse, MessageEvent,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Observable, interval, from } from 'rxjs';
import { switchMap, takeWhile, map } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { HasPermission } from '../../common/decorators/has-permission.decorator';
import { BankStatementService, BankSyncJobDto } from './bank-statement.service';
import { UpdateSettingsDto } from './dto/settings.dto';
import { UpdateTemplateDto } from './dto/template.dto';
import { CreateCountryMappingDto, UpdateCountryMappingDto } from './dto/country-mapping.dto';
import { UpsertGsheetConfigDto } from './dto/gsheet-config.dto';
import { RetryJobDto } from './dto/retry-job.dto';

@ApiTags('Bank Statement')
@ApiBearerAuth()
@Controller('management/bank-statement')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BankStatementController {
  constructor(private readonly service: BankStatementService) {}

  // ─── Schedule Settings ───────────────────────────────────────────────────────

  @Get('settings')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Lấy cài đặt lịch trình' })
  getSettings() {
    return this.service.getSettings();
  }

  @Put('settings')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Cập nhật cài đặt lịch trình' })
  updateSettings(@Body() body: UpdateSettingsDto) {
    return this.service.updateSettings(body);
  }

  // ─── Download Template ───────────────────────────────────────────────────────

  @Get('settings/template')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Lấy template header download' })
  getTemplate() {
    return this.service.getTemplate();
  }

  @Put('settings/template')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Cập nhật template header download' })
  updateTemplate(@Body() body: UpdateTemplateDto) {
    return this.service.updateTemplate(body);
  }

  // ─── Country Mappings ────────────────────────────────────────────────────────

  @Get('settings/countries')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Danh sách mapping công ty → quốc gia' })
  listCountries() {
    return this.service.listCountryMappings();
  }

  @Post('settings/countries')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Thêm mapping công ty → quốc gia' })
  createCountry(@Body() body: CreateCountryMappingDto) {
    return this.service.createCountryMapping(body);
  }

  @Put('settings/countries/:id')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Cập nhật mapping' })
  updateCountry(@Param('id') id: string, @Body() body: UpdateCountryMappingDto) {
    return this.service.updateCountryMapping(id, body);
  }

  @Delete('settings/countries/:id')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Xóa mapping' })
  deleteCountry(@Param('id') id: string) {
    return this.service.deleteCountryMapping(id);
  }

  // ─── GSheet Configs ──────────────────────────────────────────────────────────

  @Get('settings/gsheets')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Danh sách cấu hình Google Sheets' })
  listGsheets() {
    return this.service.listGsheetConfigs();
  }

  @Put('settings/gsheets/:countryCode')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Tạo / cập nhật cấu hình Google Sheets theo quốc gia' })
  upsertGsheet(@Param('countryCode') countryCode: string, @Body() body: UpsertGsheetConfigDto) {
    return this.service.upsertGsheetConfig(countryCode, body);
  }

  // ─── Accounts & Metrics ─────────────────────────────────────────────────────

  @Get('accounts')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Danh sách tài khoản ngân hàng' })
  listAccounts() {
    return this.service.listAccounts();
  }

  @Get('metrics')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Metrics giao dịch theo ngày (group by date × account)' })
  getMetrics(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('countryCode') countryCode?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.service.getMetrics(new Date(from), new Date(to), countryCode, accountId);
  }

  // ─── Job Management ──────────────────────────────────────────────────────────

  @Post('jobs')
  @HasPermission('bank_statement:run')
  @ApiOperation({ summary: 'Kích hoạt job đồng bộ bank statement' })
  trigger(@Req() req: any): Promise<BankSyncJobDto> {
    return this.service.triggerJob(req.authUser.id as string);
  }

  @Get('jobs')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Danh sách jobs (50 gần nhất)' })
  listJobs(): Promise<BankSyncJobDto[]> {
    return this.service.listJobs();
  }

  @Get('jobs/:id')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Chi tiết một job' })
  getJob(@Param('id') id: string): Promise<BankSyncJobDto> {
    return this.service.getJobDetail(id);
  }

  @Get('jobs/:id/summary')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Tóm tắt giao dịch theo tài khoản của một job' })
  getJobSummary(@Param('id') id: string) {
    return this.service.getJobSummary(id);
  }

  @Post('jobs/:id/retry')
  @HasPermission('bank_statement:run')
  @ApiOperation({ summary: 'Retry một job — reset từ stepKey (hoặc step đầu tiên chưa done) rồi re-queue' })
  retryJob(@Param('id') id: string, @Body() body: RetryJobDto, @Req() req: any): Promise<BankSyncJobDto> {
    return this.service.retryJob(id, req.authUser.id as string, body.stepKey);
  }

  @Delete('jobs/:id')
  @HasPermission('bank_statement:run')
  @ApiOperation({ summary: 'Soft-delete một job (chỉ completed/failed)' })
  deleteJob(@Param('id') id: string) {
    return this.service.softDeleteJob(id);
  }

  @Sse('jobs/:id/stream')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'SSE stream trạng thái job (hỗ trợ ?token=xxx)' })
  @ApiQuery({ name: 'token', required: false, description: 'JWT token (dùng khi EventSource không thể gửi header)' })
  streamJob(@Param('id') id: string): Observable<MessageEvent> {
    return interval(2000).pipe(
      switchMap(() => from(this.service.getJobDetail(id))),
      takeWhile(job => !['completed', 'failed'].includes(job.status), true),
      map(job => ({ data: job }) as MessageEvent),
    );
  }
}
