import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { userWithAuthArgs } from './types';

const RESET_TTL_HOURS = 1;

type SafeUser = {
  id: number;
  email: string;
  name?: string | null;
  roles: string[];
  permissions: string[];
};

@Injectable()
export class AuthService {
  private googleClient = new OAuth2Client();

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  // Shared session-issuing step for every login path (password, Google, invite activation).
  // roles/permissions are intentionally empty here — JwtAuthGuard / me() resolve them from DB.
  private issueLoginResponse(user: { id: number; email: string; name: string | null }) {
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

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, password: true, isActive: true },
    });
    if (!user || !user.isActive) return null;
    const match = await bcrypt.compare(password, user.password);
    if (!match) return null;
    return this.issueLoginResponse(user);
  }

  // Google Sign-In (GIS ID token). Invited-only: the Google email must match an
  // existing user — there is no self-signup. Pending users (hasPassword=false)
  // may log in this way; their verified Google email is sufficient proof.
  async googleLogin(credential: string) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new UnauthorizedException('GOOGLE_AUTH_FAILED');

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('GOOGLE_AUTH_FAILED');
    }
    if (!payload?.email || payload.email_verified !== true) {
      throw new UnauthorizedException('GOOGLE_AUTH_FAILED');
    }

    // Emails are stored as-entered (no normalization) while Google always returns
    // lowercase — so match case-insensitively. findFirst because the citext-less
    // @unique can in theory hold case-variant duplicates.
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: payload.email, mode: 'insensitive' } },
      select: { id: true, email: true, name: true, isActive: true },
    });
    // 403 (not 401) on purpose: the web request() helper discards 401 bodies,
    // and these codes must reach the login page for a meaningful error message.
    if (!user) throw new ForbiddenException('GOOGLE_NOT_INVITED');
    if (!user.isActive) throw new ForbiddenException('USER_INACTIVE');

    return this.issueLoginResponse(user);
  }

  async updateMyProfile(userId: number, name: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name },
      select: { id: true, email: true, name: true },
    });
  }

  async changeMyPassword(userId: number, currentPassword: string, newPassword: string) {
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

  async verifyInviteToken(token: string) {
    const invite = await this.prisma.userInvite.findUnique({
      where: { token },
      include: { user: { select: { email: true, name: true } } },
    });
    if (!invite) throw new NotFoundException('INVITE_NOT_FOUND');
    if (invite.expiredAt < new Date()) throw new UnprocessableEntityException('INVITE_EXPIRED');
    return { valid: true, email: invite.user.email, name: invite.user.name };
  }

  async setPasswordWithToken(token: string, password: string, name?: string) {
    const invite = await this.prisma.userInvite.findUnique({
      where: { token },
      include: { user: { select: { id: true } } },
    });
    if (!invite) throw new NotFoundException('INVITE_NOT_FOUND');
    if (invite.expiredAt < new Date()) throw new UnprocessableEntityException('INVITE_EXPIRED');

    const hashed = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.update({
      where: { id: invite.user.id },
      data: {
        password: hashed,
        hasPassword: true,
        ...(name?.trim() ? { name: name.trim() } : {}),
      },
      select: { id: true, email: true, name: true },
    });
    await this.prisma.userInvite.delete({ where: { token } });
    // Also issue a session so the invited user lands in the app immediately
    // instead of bouncing to the login page.
    return { ok: true, ...this.issueLoginResponse(user) };
  }

  // Always resolves { ok: true } regardless of whether the email is registered —
  // otherwise the response itself would leak which emails have an account.
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, isActive: true, hasPassword: true },
    });
    if (user && user.isActive && user.hasPassword) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiredAt = new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000);
      await this.prisma.passwordReset.deleteMany({ where: { userId: user.id } });
      await this.prisma.passwordReset.create({ data: { userId: user.id, token, expiredAt } });
      try {
        await this.mail.sendPasswordReset(user.email, user.name, token);
      } catch {
        // Swallow: the client response must stay identical whether or not delivery
        // succeeded, so we don't leak account existence via a differing error path.
        // MailService already logs the underlying failure.
      }
    }
    return { ok: true };
  }

  async verifyResetToken(token: string) {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { token },
      include: { user: { select: { email: true } } },
    });
    if (!reset) throw new NotFoundException('RESET_NOT_FOUND');
    if (reset.expiredAt < new Date()) throw new UnprocessableEntityException('RESET_EXPIRED');
    return { valid: true, email: reset.user.email };
  }

  async resetPassword(token: string, password: string) {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { token },
      include: { user: { select: { id: true } } },
    });
    if (!reset) throw new NotFoundException('RESET_NOT_FOUND');
    if (reset.expiredAt < new Date()) throw new UnprocessableEntityException('RESET_EXPIRED');

    const hashed = await bcrypt.hash(password, 10);
    await this.prisma.user.update({ where: { id: reset.user.id }, data: { password: hashed } });
    await this.prisma.passwordReset.delete({ where: { token } });
    return { ok: true };
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, ...userWithAuthArgs });
    if (!user) return null;
    const roleRows = user.roles ?? [];
    const directPermissions = user.permissions ?? [];
    const permissions = Array.from(
      new Set([
        ...roleRows.flatMap((r) => r.role.permissions.map((rp) => rp.permission.key)),
        ...directPermissions.map((up) => up.permission.key),
      ]),
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
