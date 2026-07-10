import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { roleListArgs } from './types/role-list.type';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async listRoles() {
    return this.prisma.role.findMany({
      ...roleListArgs,
      orderBy: [{ group: 'asc' }, { name: 'asc' }],
    });
  }

  async deleteRole(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, select: { id: true, isSystem: true } });
    if (!role) throw new NotFoundException('ROLE_NOT_FOUND');
    if (role.isSystem) throw new ForbiddenException('CANNOT_DELETE_SYSTEM_ROLE');
    await this.prisma.role.delete({ where: { id: roleId } });
  }
}
