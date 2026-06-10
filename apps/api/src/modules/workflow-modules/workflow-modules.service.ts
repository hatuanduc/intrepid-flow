import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';

@Injectable()
export class WorkflowModulesService {
  constructor(
    private prisma: PrismaService,
    private permissions: PermissionsService,
  ) {}

  async listModules() {
    return this.prisma.workflowModule.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async updateModule(key: string, input: { isEnabled?: boolean }) {
    const module = await this.prisma.workflowModule.findUnique({ where: { key } });
    if (!module) throw new NotFoundException('MODULE_NOT_FOUND');
    return this.prisma.workflowModule.update({ where: { key }, data: input });
  }

  async createModule(input: { key: string; name: string; description?: string; sortOrder?: number }) {
    const module = await this.prisma.workflowModule.create({
      data: { ...input, isEnabled: false },
    });
    // Auto-create permissions for this new module
    await this.permissions.syncPermissions();
    return module;
  }
}
