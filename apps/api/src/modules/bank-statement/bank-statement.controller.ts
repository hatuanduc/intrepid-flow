import {
  Controller, Get, Put, Post, Delete, Query,
  Body, Param, UseGuards, Req, Res, Sse, MessageEvent,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { Observable, interval, from } from 'rxjs';
import { switchMap, takeWhile, map } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { HasPermission } from '../../common/decorators/has-permission.decorator';
import { BankStatementService, BankSyncJobDto } from './bank-statement.service';
import { UpdateSettingsDto } from './dto/settings.dto';
import { UpdateTemplateDto } from './dto/template.dto';
import { UpsertGsheetConfigDto } from './dto/gsheet-config.dto';
import { UpsertDriveExportConfigDto } from './dto/drive-export-config.dto';
import { RetryJobDto } from './dto/retry-job.dto';
import { TriggerJobDto } from './dto/trigger-job.dto';
import { CreateAccountNameDto } from './dto/create-account-name.dto';
import { UpdateAccountNameDto } from './dto/update-account-name.dto';
import { UpdateAccountSyncDto } from './dto/update-account-sync.dto';

@ApiTags('Bank Statement')
@ApiBearerAuth()
@Controller('management/bank-statement')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class BankStatementController {
  constructor(private readonly service: BankStatementService) {}

  // ─── Schedule Settings ───────────────────────────────────────────────────────

  @Get('settings')
  @HasPermission('bank_statement:view')
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

  // ─── Currency Rates (read-only, for metrics page) ───────────────────────────

  @Get('currency-rates')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Lấy tỉ giá hối đoái hiện tại' })
  getCurrencyRates() {
    return this.service.getCurrencyRates();
  }

  // ─── Download Template ───────────────────────────────────────────────────────

  @Get('settings/template')
  @HasPermission('bank_statement:view')
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

  // ─── GSheet Configs ──────────────────────────────────────────────────────────

  @Get('settings/gsheets')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Danh sách cấu hình Google Sheets' })
  listGsheets() {
    return this.service.listGsheetConfigs();
  }

  @Put('settings/gsheets/:accountCode')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Tạo / cập nhật cấu hình Google Sheets theo account code' })
  upsertGsheet(@Param('accountCode') accountCode: string, @Body() body: UpsertGsheetConfigDto) {
    return this.service.upsertGsheetConfig(accountCode, body);
  }

  // ─── Drive Export Configs (PDF giao dịch) ───────────────────────────────────

  @Get('settings/drive-export')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Danh sách cấu hình thư mục Google Drive để xuất PDF giao dịch' })
  listDriveExport() {
    return this.service.listDriveExportConfigs();
  }

  @Put('settings/drive-export/:accountCode')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Tạo / cập nhật cấu hình thư mục Google Drive theo account code' })
  upsertDriveExport(@Param('accountCode') accountCode: string, @Body() body: UpsertDriveExportConfigDto) {
    return this.service.upsertDriveExportConfig(accountCode, body);
  }

  // ─── Accounts & Metrics ─────────────────────────────────────────────────────

  @Get('account-names')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Danh sách account name (master data) declared cho sync' })
  @ApiQuery({ name: 'all', required: false, description: 'true để lấy cả account name đã disable (dùng cho trang Settings)' })
  listAccountNames(@Query('all') all?: string) {
    return this.service.listAccountNames(all === 'true');
  }

  @Post('account-names')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Thêm account name (master data) mới' })
  createAccountName(@Body() body: CreateAccountNameDto) {
    return this.service.createAccountName(body.name, body.accountCode);
  }

  @Put('account-names/:id')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Sửa tên/account code, hoặc bật/tắt đồng bộ cho toàn bộ account number thuộc account name này' })
  updateAccountName(@Param('id') id: string, @Body() body: UpdateAccountNameDto) {
    return this.service.updateAccountName(Number(id), body);
  }

  @Delete('account-names/:id')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Xóa account name — chỉ khi chưa có account number nào thuộc về nó' })
  deleteAccountName(@Param('id') id: string) {
    return this.service.deleteAccountName(Number(id));
  }

  @Get('accounts')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Danh sách tài khoản ngân hàng' })
  listAccounts() {
    return this.service.listAccounts();
  }

  @Put('accounts/:id')
  @HasPermission('bank_statement:config')
  @ApiOperation({ summary: 'Bật/tắt đồng bộ cho 1 account number cụ thể' })
  updateAccountSync(@Param('id') id: string, @Body() body: UpdateAccountSyncDto) {
    return this.service.updateAccountSyncEnabled(Number(id), body.syncEnabled);
  }

  @Get('transactions/:id/pdf')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Xem/tải PDF của 1 giao dịch đã xuất' })
  async getTransactionPdf(@Param('id') id: string, @Res({ passthrough: false }) res: Response) {
    const { stream, filename, contentType } = await this.service.getTransactionPdf(Number(id));
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
    stream.pipe(res);
  }

  @Post('jobs/:jobId/accounts/:accountId/resync-sheets')
  @HasPermission('bank_statement:run')
  @ApiOperation({ summary: 'Force resync — đồng bộ lại giao dịch của tài khoản này trong job lên Google Sheets, bỏ qua check đã sync' })
  resyncSheets(@Param('jobId') jobId: string, @Param('accountId') accountId: string, @Req() req: any) {
    return this.service.forceResyncSheets(jobId, Number(accountId), String(req.authUser.id));
  }

  @Post('jobs/:jobId/accounts/:accountId/resync-drive')
  @HasPermission('bank_statement:run')
  @ApiOperation({ summary: 'Force resync — đồng bộ lại PDF của tài khoản này trong job lên Google Drive, không cần fetch lại từ HSBC' })
  resyncDrive(@Param('jobId') jobId: string, @Param('accountId') accountId: string, @Req() req: any) {
    return this.service.forceResyncDrive(jobId, Number(accountId), String(req.authUser.id));
  }

  @Get('metrics')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Metrics giao dịch theo ngày (group by date × account)' })
  getMetrics(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('accountCode') accountCode?: string,
    @Query('accountId') accountId?: string,
  ) {
    return this.service.getMetrics(new Date(from), new Date(to), accountCode, accountId ? Number(accountId) : undefined);
  }

  @Get('coverage')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Trạng thái fetch/sync theo từng ngày (dùng cho lịch đồng bộ)' })
  getCoverage(@Query('from') from: string, @Query('to') to: string) {
    return this.service.getCoverage(new Date(from), new Date(to));
  }

  // ─── Job Management ──────────────────────────────────────────────────────────

  @Post('jobs')
  @HasPermission('bank_statement:run')
  @ApiOperation({ summary: 'Kích hoạt job đồng bộ bank statement — có thể ghi đè khoảng ngày cho riêng lần chạy này' })
  trigger(@Req() req: any, @Body() body: TriggerJobDto): Promise<BankSyncJobDto> {
    return this.service.triggerJob(String(req.authUser.id), body.dateFrom, body.dateTo);
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

  @Get('jobs/:id/stats')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Thống kê tiến độ đồng bộ theo account của một job' })
  getJobStats(@Param('id') id: string) {
    return this.service.getJobStats(id);
  }

  @Get('jobs/:id/summary')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Tóm tắt giao dịch theo tài khoản của một job' })
  getJobSummary(@Param('id') id: string) {
    return this.service.getJobSummary(id);
  }

  @Get('account-transactions')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Danh sách giao dịch theo tài khoản + khoảng ngày' })
  getAccountTransactions(
    @Query('accountId') accountId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.getAccountTransactions(Number(accountId), new Date(from), new Date(to));
  }

  @Get('jobs/:id/account-transactions')
  @HasPermission('bank_statement:view')
  @ApiOperation({ summary: 'Danh sách giao dịch của một tài khoản trong job' })
  getJobAccountTransactions(@Param('id') id: string, @Query('accountId') accountId: string) {
    return this.service.getJobAccountTransactions(id, Number(accountId));
  }

  @Post('jobs/:id/retry')
  @HasPermission('bank_statement:run')
  @ApiOperation({ summary: 'Retry một job — reset từ stepKey (hoặc step đầu tiên chưa done) rồi re-queue' })
  retryJob(@Param('id') id: string, @Body() body: RetryJobDto, @Req() req: any): Promise<BankSyncJobDto> {
    return this.service.retryJob(id, String(req.authUser.id), body.stepKey);
  }

  @Post('jobs/:id/resync-sheets')
  @HasPermission('bank_statement:run')
  @ApiOperation({ summary: 'Force resync — đồng bộ lại toàn bộ giao dịch của mọi tài khoản trong job này lên Google Sheets' })
  resyncJobSheets(@Param('id') id: string, @Req() req: any) {
    return this.service.forceResyncSheetsForJob(id, String(req.authUser.id));
  }

  @Post('jobs/:id/resync-drive')
  @HasPermission('bank_statement:run')
  @ApiOperation({ summary: 'Force resync — đồng bộ lại PDF của mọi tài khoản trong job này lên Google Drive' })
  resyncJobDrive(@Param('id') id: string, @Req() req: any) {
    return this.service.forceResyncDriveForJob(id, String(req.authUser.id));
  }

  @Post('jobs/:id/cancel')
  @HasPermission('bank_statement:run')
  @ApiOperation({ summary: 'Cancel một job đang chạy hoặc đang chờ' })
  cancelJob(@Param('id') id: string) {
    return this.service.cancelJob(id);
  }

  @Delete('jobs/:id')
  @HasPermission('bank_statement:run')
  @ApiOperation({ summary: 'Soft-delete một job (chỉ completed/failed/cancelled)' })
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
      takeWhile(job => !['completed', 'failed', 'cancelled'].includes(job.status), true),
      map(job => ({ data: job }) as MessageEvent),
    );
  }
}
