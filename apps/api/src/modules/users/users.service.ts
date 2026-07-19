import { Injectable, ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { userListArgs } from './types';
import type { UserListRow } from './types';
import { CreateUserInput, UpdateUserInput } from './types';
import { roleListArgs } from '../roles/types';
import type { RoleSummary } from '../roles/types';
import { RESTRICTED_PERMISSION_KEYS } from '../permissions/permissions.service';

function toUserItem(user: UserListRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    hasPassword: user.hasPassword,
    roles: user.roles.map((item: { role: RoleSummary }) => item.role),
    permissions: user.permissions.map((item) => item.permission),
  };
}

function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

const INVITE_TTL_DAYS = 7;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

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

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }

  // Restricted permissions (e.g. system:config, users:reset-password) only ever come from a
  // role definition (Super Admin) — never honor them if smuggled into a direct permissionIds
  // payload, since the picker UI never offers them in the first place.
  private async stripRestrictedPermissionIds(permissionIds: number[]) {
    if (permissionIds.length === 0) return permissionIds;
    const restricted = await this.prisma.permission.findMany({
      where: { key: { in: Array.from(RESTRICTED_PERMISSION_KEYS) } },
      select: { id: true },
    });
    const restrictedIds = new Set(restricted.map((p) => p.id));
    return permissionIds.filter((id) => !restrictedIds.has(id));
  }

  async createUser(input: CreateUserInput) {
    const existed = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existed) throw new ConflictException('EMAIL_EXISTS');

    if (input.roleIds.length > 0) {
      const roleCount = await this.prisma.role.count({
        where: { id: { in: input.roleIds } },
      });
      if (roleCount !== input.roleIds.length) {
        throw new UnprocessableEntityException('ROLE_NOT_FOUND');
      }
    }

    const permissionIds = await this.stripRestrictedPermissionIds(input.permissionIds ?? []);
    if (permissionIds.length > 0) {
      const permissionCount = await this.prisma.permission.count({
        where: { id: { in: permissionIds } },
      });
      if (permissionCount !== permissionIds.length) {
        throw new UnprocessableEntityException('PERMISSION_NOT_FOUND');
      }
    }

    // Random placeholder password — user can't login until they set their own via invite
    const placeholderPw = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

    const created = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name ?? null,
        password: placeholderPw,
        hasPassword: false,
        isActive: true,
        roles: {
          create: input.roleIds.map((roleId) => ({ roleId })),
        },
        permissions: {
          create: permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      ...userListArgs,
    });

    // Generate and send invite
    const token = generateInviteToken();
    const expiredAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.userInvite.create({ data: { userId: created.id, token, expiredAt } });
    await this.mail.sendInvite(created.email, created.name, token);

    return toUserItem(created);
  }

  async resendInvite(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, hasPassword: true },
    });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    if (user.hasPassword) throw new BadRequestException('USER_ALREADY_HAS_PASSWORD');

    // Rotate token
    await this.prisma.userInvite.deleteMany({ where: { userId } });
    const token = generateInviteToken();
    const expiredAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.userInvite.create({ data: { userId, token, expiredAt } });
    await this.mail.sendInvite(user.email, user.name, token);
    return { ok: true };
  }

  async updateUser(
    userId: number,
    input: UpdateUserInput,
    currentUserId?: number,
    actorPermissions: string[] = [],
  ) {
    const existed = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existed) throw new NotFoundException('USER_NOT_FOUND');

    if (input.isActive === false && userId === currentUserId) {
      throw new UnprocessableEntityException('CANNOT_DEACTIVATE_SELF');
    }

    if (input.password && !actorPermissions.includes('users:reset-password')) {
      throw new ForbiddenException('CANNOT_RESET_PASSWORD');
    }

    if (input.roleIds) {
      const roleCount = await this.prisma.role.count({
        where: { id: { in: input.roleIds } },
      });
      if (roleCount !== input.roleIds.length) {
        throw new UnprocessableEntityException('ROLE_NOT_FOUND');
      }
    }

    if (input.permissionIds) {
      input.permissionIds = await this.stripRestrictedPermissionIds(input.permissionIds);
      const permissionCount = await this.prisma.permission.count({
        where: { id: { in: input.permissionIds } },
      });
      if (permissionCount !== input.permissionIds.length) {
        throw new UnprocessableEntityException('PERMISSION_NOT_FOUND');
      }
    }

    const nextPassword = input.password ? bcrypt.hashSync(input.password, 10) : undefined;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: input.name,
        isActive: input.isActive,
        password: nextPassword,
        hasPassword: nextPassword ? true : undefined,
        roles: input.roleIds
          ? {
              deleteMany: {},
              create: input.roleIds.map((roleId) => ({ roleId })),
            }
          : undefined,
        permissions: input.permissionIds
          ? {
              deleteMany: {},
              create: input.permissionIds.map((permissionId) => ({ permissionId })),
            }
          : undefined,
      },
      ...userListArgs,
    });

    return toUserItem(updated);
  }

  async deleteUser(userId: number) {
    const existed = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existed) throw new NotFoundException('USER_NOT_FOUND');
    await this.prisma.user.delete({ where: { id: userId } });
  }

  async impersonateUser(adminId: number, targetUserId: number) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, name: true, isActive: true, hasPassword: true },
    });
    if (!target) throw new NotFoundException('USER_NOT_FOUND');
    if (!target.isActive) throw new UnprocessableEntityException('USER_INACTIVE');
    if (!target.hasPassword) throw new UnprocessableEntityException('USER_PENDING');

    const token = jwt.sign(
      { sub: target.id, email: target.email, impersonatedBy: adminId },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '2h' },
    );
    return { token, user: { id: target.id, email: target.email, name: target.name } };
  }

  async createRole(input: {
    key: string;
    name: string;
    description?: string;
    permissionIds: number[];
  }) {
    const existed = await this.prisma.role.findUnique({
      where: { key: input.key },
      select: { id: true },
    });
    if (existed) throw new ConflictException('ROLE_KEY_EXISTS');

    const permissionCount = await this.prisma.permission.count({
      where: { id: { in: input.permissionIds } },
    });
    if (permissionCount !== input.permissionIds.length) {
      throw new UnprocessableEntityException('PERMISSION_NOT_FOUND');
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
    roleId: number,
    input: {
      name?: string;
      description?: string;
      permissionIds?: number[];
    },
  ) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, isSystem: true },
    });
    if (!role) throw new NotFoundException('ROLE_NOT_FOUND');

    if (input.permissionIds) {
      const permissionCount = await this.prisma.permission.count({
        where: { id: { in: input.permissionIds } },
      });
      if (permissionCount !== input.permissionIds.length) {
        throw new UnprocessableEntityException('PERMISSION_NOT_FOUND');
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
