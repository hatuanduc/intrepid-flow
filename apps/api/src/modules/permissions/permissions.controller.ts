import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { HasPermission } from '../../common/decorators/has-permission.decorator';
import { PermissionItem } from './dto/permission-response.dto';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('management')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class PermissionsController {
  constructor(private perms: PermissionsService) {}

  @Get('permissions')
  @HasPermission('permissions:view')
  @ApiOperation({ summary: 'Danh sách quyền' })
  @ApiResponse({ status: 200, type: PermissionItem, isArray: true })
  async getPermissions() {
    const items = await this.perms.listPermissions();
    return { items };
  }
}
