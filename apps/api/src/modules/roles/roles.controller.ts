import { Body, Controller, Get, Post, Put, Param, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('management')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private roles: RolesService) {}

  @Get('roles')
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
  async postRole(@Body() body: any) {
    const { name, description, permissionIds } = body;
    const role = await this.roles.createRole({ name, description, permissionIds: permissionIds ?? [] });
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
  async putRole(@Param('id') id: string, @Body() body: any) {
    const { name, description, permissionIds } = body;
    const role = await this.roles.updateRole(id, { name, description, permissionIds });
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

  @Get('permissions')
  async getPermissions() {
    // moved to PermissionsModule
    return { items: [] };
  }
}
