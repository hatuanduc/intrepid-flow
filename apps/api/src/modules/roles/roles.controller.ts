import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { HasPermission } from '../../common/decorators/has-permission.decorator';
import { RoleResponseDto } from './dto/role-response.dto';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('management')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class RolesController {
  constructor(private roles: RolesService) {}

  @Get('roles')
  @HasPermission('roles:view')
  @ApiOperation({ summary: 'Danh sách vai trò' })
  @ApiResponse({ status: 200, type: RoleResponseDto, isArray: true })
  async getRoles() {
    const roles = await this.roles.listRoles();
    return {
      items: roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        group: role.group,
        description: role.description,
        isSystem: role.isSystem,
        userCount: role._count.users,
        permissions: role.permissions.map((item) => item.permission),
      })),
    };
  }

  @Delete('roles/:id')
  @HasPermission('roles:view')
  @ApiOperation({ summary: 'Xóa vai trò (chỉ non-system)' })
  @ApiResponse({ status: 200, schema: { example: { ok: true } } })
  async deleteRole(@Param('id') id: string) {
    await this.roles.deleteRole(id);
    return { ok: true };
  }
}
