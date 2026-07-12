import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from '../decorators/has-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | string[]>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const { authUser } = context.switchToHttp().getRequest();
    const requiredList = Array.isArray(required) ? required : [required];
    const hasAny = requiredList.some(p => authUser?.permissions?.includes(p));
    if (!hasAny) {
      throw new ForbiddenException('FORBIDDEN');
    }
    return true;
  }
}
