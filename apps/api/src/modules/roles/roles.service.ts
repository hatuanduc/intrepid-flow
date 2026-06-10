import { Injectable, UnprocessableEntityException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { roleListArgs } from './types/role-list.type';
import { IdGeneratorService } from '../../common/id-generator.service';

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private idGenerator: IdGeneratorService,
  ) {}

  async listRoles() {
    return this.prisma.role.findMany({
      ...roleListArgs,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async createRole(input: { name: string; description?: string; permissionIds: string[] }) {
    const key = this.idGenerator.slugKey(input.name);

    const permissionCount = await this.prisma.permission.count({ where: { id: { in: input.permissionIds } } });
    if (permissionCount !== input.permissionIds.length) throw new UnprocessableEntityException('PERMISSION_NOT_FOUND');

    return this.prisma.role.create({
      data: {
        key,
        name: input.name,
        description: input.description,
        isSystem: false,
        permissions: { create: input.permissionIds.map((permissionId) => ({ permissionId })) },
      },
      ...roleListArgs,
    });
  }

  async updateRole(roleId: string, input: { name?: string; description?: string; permissionIds?: string[] }) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, select: { id: true, isSystem: true } });
    if (!role) throw new Error('ROLE_NOT_FOUND');

    if (input.permissionIds) {
      const permissionCount = await this.prisma.permission.count({ where: { id: { in: input.permissionIds } } });
      if (permissionCount !== input.permissionIds.length) throw new Error('PERMISSION_NOT_FOUND');
    }

    return this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: input.name,
        description: input.description,
        permissions: input.permissionIds
          ? { deleteMany: {}, create: input.permissionIds.map((permissionId) => ({ permissionId })) }
          : undefined,
      },
      ...roleListArgs,
    });
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  }
}
