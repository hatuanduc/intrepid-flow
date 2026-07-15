import {
  BadRequestException, Body, Controller, Get, Post, Res, UploadedFile, UploadedFiles, UseGuards, UseInterceptors,
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

const MAX_FILE_SIZE = 60 * 1024 * 1024; // 60MB per file

@ApiTags('Reconcile')
@ApiBearerAuth()
@Controller('management/reconcile')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReconcileController {
  constructor(private readonly service: ReconcileService) {}

  @Post('filter-merge')
  @HasPermission('reconcile:run')
  @ApiOperation({ summary: 'Lọc và gộp hóa đơn Service/Other từ nhiều file, loại trừ Retail khỏi chi tiết' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        headerRow: { type: 'integer', example: 1 },
        salesColumn: { type: 'string' },
        taxColumn: { type: 'string' },
        noteColumn: { type: 'string' },
        customerColumn: { type: 'string' },
        outputFileName: { type: 'string' },
      },
      required: ['files', 'headerRow', 'salesColumn', 'taxColumn', 'noteColumn', 'customerColumn', 'outputFileName'],
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
    @Res({ passthrough: false }) res: Response,
  ) {
    const invoiceFiles = (uploaded.files ?? []).map(f => ({ path: f.path, originalName: f.originalname }));

    if (invoiceFiles.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất 1 file hóa đơn.');
    }

    const tempPaths = invoiceFiles.map(f => f.path);

    try {
      const { path: outPath, filename } = await this.service.runFilterMerge(invoiceFiles, body);
      tempPaths.push(outPath);

      const buffer = await fs.readFile(outPath);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      });
      res.send(buffer);
    } finally {
      await Promise.all(tempPaths.map(p => fs.unlink(p).catch(() => {})));
    }
  }

  @Get('master-customer')
  @HasPermission('reconcile:view')
  @ApiOperation({ summary: 'Xem thông tin dữ liệu Master Customer đã lưu (số brand, cập nhật lúc)' })
  async getMasterCustomerInfo() {
    return this.service.getMasterCustomerInfo();
  }

  @Post('master-customer')
  @HasPermission('reconcile:run')
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
