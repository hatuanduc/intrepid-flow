import { Injectable, ConflictException, NotFoundException, UnprocessableEntityException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
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
    hasPassword: user.hasPassword,
    roles: user.roles.map((item: { role: RoleSummary }) => item.role),
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

  async resendInvite(userId: string) {
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

  async updateUser(userId: string, input: UpdateUserInput) {
    const existed = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existed) throw new NotFoundException('USER_NOT_FOUND');

    if (input.roleIds) {
      const roleCount = await this.prisma.role.count({
        where: { id: { in: input.roleIds } },
      });
      if (roleCount !== input.roleIds.length) {
        throw new UnprocessableEntityException('ROLE_NOT_FOUND');
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
      },
      ...userListArgs,
    });

    return toUserItem(updated);
  }

  async deleteUser(userId: string) {
    const existed = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!existed) throw new NotFoundException('USER_NOT_FOUND');
    await this.prisma.user.delete({ where: { id: userId } });
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
