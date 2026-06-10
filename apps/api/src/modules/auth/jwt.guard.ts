import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import jwt from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers?.authorization as string | undefined;
    const token = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null;
    if (!token) return false;
    try {
      const payload: any = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) return false;
      req.authUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: (user as any).roles ?? [],
        permissions: [],
      };
      return true;
    } catch {
      return false;
    }
  }
}
