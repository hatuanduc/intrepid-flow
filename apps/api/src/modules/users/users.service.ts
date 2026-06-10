import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import bcrypt from 'bcryptjs';
import { userListArgs } from './types';
import type { UserListRow } from './types';
import { CreateUserInput, UpdateUserInput } from './types';
import { roleListArgs } from '../roles/types';
import type { RoleSummary } from '../roles/types';

function toUserItem(user: UserListRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    roles: user.roles.map((item: { role: RoleSummary }) => item.role),
  };
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async listUsers(search?: string) {
    const users = await this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      ...userListArgs,
      orderBy: { createdAt: 'desc' },
    });
    return users.map(toUserItem);
  }

  // role operations moved to RolesModule

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }

  async createUser(input: CreateUserInput) {
    const existed = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existed) {
      throw new Error('EMAIL_EXISTS');
    }

    const roleCount = await this.prisma.role.count({
      where: { id: { in: input.roleIds } },
    });
    if (roleCount !== input.roleIds.length) {
      throw new Error('ROLE_NOT_FOUND');
    }

    const password = bcrypt.hashSync(input.password, 10);

    const created = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        password,
        isActive: true,
        roles: {
          create: input.roleIds.map((roleId) => ({ roleId })),
        },
      },
      ...userListArgs,
    });

    return toUserItem(created);
  }

  async updateUser(userId: string, input: UpdateUserInput) {
    const existed = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existed) {
      throw new Error('USER_NOT_FOUND');
    }

    if (input.roleIds) {
      const roleCount = await this.prisma.role.count({
        where: { id: { in: input.roleIds } },
      });
      if (roleCount !== input.roleIds.length) {
        throw new Error('ROLE_NOT_FOUND');
      }
    }

    const nextPassword = input.password ? bcrypt.hashSync(input.password, 10) : undefined;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        isActive: input.isActive,
        password: nextPassword,
        roles: input.roleIds
          ? {
              deleteMany: {},
              create: input.roleIds.map((roleId) => ({ roleId })),
            }
          : undefined,
      },
      ...userListArgs,
    });

    return toUserItem(updated);
  }

  async createRole(input: {
    key: string;
    name: string;
    description?: string;
    permissionIds: string[];
  }) {
    const existed = await this.prisma.role.findUnique({
      where: { key: input.key },
      select: { id: true },
    });
    if (existed) {
      throw new Error('ROLE_KEY_EXISTS');
    }

    const permissionCount = await this.prisma.permission.count({
      where: { id: { in: input.permissionIds } },
    });
    if (permissionCount !== input.permissionIds.length) {
      throw new Error('PERMISSION_NOT_FOUND');
    }

    return this.prisma.role.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description,
        isSystem: false,
        permissions: {
          create: input.permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      ...roleListArgs,
    });
  }

  async updateRole(
    roleId: string,
    input: {
      name?: string;
      description?: string;
      permissionIds?: string[];
    },
  ) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, isSystem: true },
    });
    if (!role) throw new Error('ROLE_NOT_FOUND');

    if (input.permissionIds) {
      const permissionCount = await this.prisma.permission.count({
        where: { id: { in: input.permissionIds } },
      });
      if (permissionCount !== input.permissionIds.length) {
        throw new Error('PERMISSION_NOT_FOUND');
      }
    }

    return this.prisma.role.update({
      where: { id: roleId },
      data: {
        name: input.name,
        description: input.description,
        permissions: input.permissionIds
          ? {
              deleteMany: {},
              create: input.permissionIds.map((permissionId) => ({ permissionId })),
            }
          : undefined,
      },
      ...roleListArgs,
    });
  }
}
