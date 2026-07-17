import {
  BadRequestException, Body, Controller, Get, Param, Post, Put, Res, UploadedFile, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { HasPermission } from '../../common/decorators/has-permission.decorator';
import { ReconcileService } from './reconcile.service';
import { FilterMergeDto } from './dto/filter-merge.dto';
import { ReplaceMasterCustomerDto } from './dto/replace-master-customer.dto';
import { UpdateReconcileSettingsDto } from './dto/update-reconcile-settings.dto';

const MAX_FILE_SIZE = 60 * 1024 * 1024; // 60MB per file

@ApiTags('Reconcile')
@ApiBearerAuth()
@Controller('management/reconcile')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReconcileController {
  constructor(private readonly service: ReconcileService) {}

  @Post('filter-merge')
  @HasPermission('reconcile:run')
  @ApiOperation({ summary: 'Bắt đầu job lọc và gộp hóa đơn Service/Other từ nhiều file (chạy nền — xem tiến độ qua /status, tải kết quả qua /download)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        outputFileName: { type: 'string' },
      },
      required: ['files'],
    },
  })
  @UseInterceptors(FileFieldsInterceptor(
    [{ name: 'files', maxCount: 5 }],
    {
      storage: diskStorage({
        destination: os.tmpdir(),
        filename: (_req, file, cb) => cb(null, `reconcile-${randomUUID()}${path.extname(file.originalname) || '.xlsx'}`),
      }),
      limits: { fileSize: MAX_FILE_SIZE },
    },
  ))
  async filterMerge(
    @UploadedFiles() uploaded: { files?: Express.Multer.File[] },
    @Body() body: FilterMergeDto,
  ) {
    const invoiceFiles = (uploaded.files ?? []).map(f => ({ path: f.path, originalName: f.originalname }));

    if (invoiceFiles.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 file hóa đơn.');
    }

    try {
      return await this.service.startFilterMerge(invoiceFiles, body.outputFileName ?? '');
    } finally {
      await Promise.all(invoiceFiles.map(f => fs.unlink(f.path).catch(() => {})));
    }
  }

  @Get('filter-merge/:jobId/status')
  @HasPermission('reconcile:run')
  @ApiOperation({ summary: 'Kiểm tra tiến độ job lọc và gộp hóa đơn' })
  async filterMergeStatus(@Param('jobId') jobId: string) {
    return this.service.getFilterMergeStatus(jobId);
  }

  @Get('filter-merge/:jobId/download')
  @HasPermission('reconcile:run')
  @ApiOperation({ summary: 'Tải file kết quả sau khi job lọc và gộp hóa đơn hoàn tất' })
  async filterMergeDownload(@Param('jobId') jobId: string, @Res({ passthrough: false }) res: Response) {
    const { stream, filename, contentType } = await this.service.downloadFilterMergeResult(jobId);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    });
    stream.pipe(res);
  }

  @Get('settings')
  @HasPermission('reconcile:view')
  @ApiOperation({ summary: 'Xem cấu hình cột hiện tại của công cụ Reconcile' })
  async getSettings() {
    return this.service.getSettings();
  }

  @Put('settings')
  @HasPermission('reconcile:config')
  @ApiOperation({ summary: 'Cập nhật cấu hình cột của công cụ Reconcile' })
  async updateSettings(@Body() body: UpdateReconcileSettingsDto) {
    return this.service.updateSettings(body);
  }

  @Get('master-customer')
  @HasPermission('reconcile:view')
  @ApiOperation({ summary: 'Xem thông tin dữ liệu Master Customer đã lưu (số brand, cập nhật lúc)' })
  async getMasterCustomerInfo() {
    return this.service.getMasterCustomerInfo();
  }

  @Post('master-customer')
  @HasPermission('reconcile:config')
  @ApiOperation({ summary: 'Thay thế toàn bộ dữ liệu Master Customer bằng file mới upload' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        brandColumn: { type: 'string' },
        customerColumn: { type: 'string' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: os.tmpdir(),
      filename: (_req, file, cb) => cb(null, `reconcile-master-${randomUUID()}${path.extname(file.originalname) || '.xlsx'}`),
    }),
    limits: { fileSize: MAX_FILE_SIZE },
  }))
  async replaceMasterCustomer(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: ReplaceMasterCustomerDto,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file Master Customer.');
    }

    try {
      return await this.service.replaceMasterCustomerData(
        { path: file.path, originalName: file.originalname },
        body.brandColumn,
        body.customerColumn,
      );
    } finally {
      await fs.unlink(file.path).catch(() => {});
    }
  }
}
