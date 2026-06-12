import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PermissionItem } from './dto/permission-response.dto';

@ApiTags('Permissions')
@ApiBearerAuth()
@Controller('management')
@UseGuards(JwtAuthGuard)
export class PermissionsController {
  constructor(private perms: PermissionsService) {}

  @Get('permissions')
  @ApiOperation({ summary: 'Danh sách quyền' })
  @ApiResponse({ status: 200, type: PermissionItem, isArray: true })
  async getPermissions() {
    const items = await this.perms.listPermissions();
    return { items };
  }
}
