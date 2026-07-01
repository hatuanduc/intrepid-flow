import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { userWithAuthArgs } from './types';

type SafeUser = {
  id: string;
  email: string;
  name?: string | null;
  roles: string[];
  permissions: string[];
};

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, password: true, isActive: true },
    });
    if (!user || !user.isActive) return null;
    const match = await bcrypt.compare(password, user.password);
    if (!match) return null;
    const token = jwt.sign(
      { sub: user.id, email: user.email },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '7d' },
    );

    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, roles: [], permissions: [] },
    };
  }

  async updateMyProfile(userId: string, name: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name },
      select: { id: true, email: true, name: true },
    });
  }

  async changeMyPassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new UnauthorizedException('INVALID_PASSWORD');
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, ...userWithAuthArgs });
    if (!user) return null;
    const roleRows = user.roles ?? [];
    const permissions = Array.from(
      new Set(roleRows.flatMap((r) => r.role.permissions.map((rp) => rp.permission.key))),
    );
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: roleRows.map((r) => r.role.key),
        permissions,
      },
    };
  }
}
