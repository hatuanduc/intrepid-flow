import { Body, Controller, Delete, Get, Post, Put, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleResponseDto } from './dto/role-response.dto';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('management')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private roles: RolesService) {}

  @Get('roles')
  @ApiOperation({ summary: 'Danh sách vai trò' })
  @ApiResponse({ status: 200, type: RoleResponseDto, isArray: true })
  async getRoles() {
    const roles = await this.roles.listRoles();
    return {
      items: roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        userCount: role._count.users,
        permissions: role.permissions.map((item) => item.permission),
      })),
    };
  }

  @Post('roles')
  @ApiOperation({ summary: 'Tạo vai trò mới' })
  @ApiResponse({ status: 201, type: RoleResponseDto })
  async postRole(@Body() body: CreateRoleDto) {
    const role = await this.roles.createRole(body);
    return {
      item: {
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        userCount: role._count.users,
        permissions: role.permissions.map((item) => item.permission),
      },
    };
  }

  @Put('roles/:id')
  @ApiOperation({ summary: 'Cập nhật vai trò' })
  @ApiResponse({ status: 200, type: RoleResponseDto })
  async putRole(@Param('id') id: string, @Body() body: UpdateRoleDto) {
    const role = await this.roles.updateRole(id, body);
    return {
      item: {
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        userCount: role._count.users,
        permissions: role.permissions.map((item) => item.permission),
      },
    };
  }

  @Delete('roles/:id')
  @ApiOperation({ summary: 'Xóa vai trò' })
  @ApiResponse({ status: 200, schema: { example: { ok: true } } })
  async deleteRole(@Param('id') id: string) {
    await this.roles.deleteRole(id);
    return { ok: true };
  }
}
