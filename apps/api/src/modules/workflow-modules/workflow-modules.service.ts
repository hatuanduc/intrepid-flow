import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WorkflowModulesService {
  constructor(private prisma: PrismaService) {}

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
}
