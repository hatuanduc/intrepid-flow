import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async listBranches() {
    return this.prisma.branch.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { userRoles: true } } },
    });
  }

  async createBranch(input: { code: string; name: string; address?: string }) {
    const existed = await this.prisma.branch.findUnique({ where: { code: input.code }, select: { id: true } });
    if (existed) throw new ConflictException('BRANCH_CODE_EXISTS');
    return this.prisma.branch.create({ data: input });
  }

  async updateBranch(id: string, input: { name?: string; address?: string; isActive?: boolean }) {
    const branch = await this.prisma.branch.findUnique({ where: { id }, select: { id: true } });
    if (!branch) throw new NotFoundException('BRANCH_NOT_FOUND');
    return this.prisma.branch.update({ where: { id }, data: input });
  }

  // --- UserBranchRole ---

  async listUserBranchRoles(userId: string) {
    return this.prisma.userBranchRole.findMany({
      where: { userId },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        role: { select: { id: true, key: true, name: true } },
      },
      orderBy: [{ branch: { name: 'asc' } }, { role: { name: 'asc' } }],
    });
  }

  async assignBranchRole(input: { userId: string; branchId: string; roleId: string }) {
    const [user, branch, role] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } }),
      this.prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true } }),
      this.prisma.role.findUnique({ where: { id: input.roleId }, select: { id: true } }),
    ]);
    if (!user) throw new NotFoundException('USER_NOT_FOUND');
    if (!branch) throw new NotFoundException('BRANCH_NOT_FOUND');
    if (!role) throw new NotFoundException('ROLE_NOT_FOUND');

    return this.prisma.userBranchRole.create({
      data: { userId: input.userId, branchId: input.branchId, roleId: input.roleId },
      include: {
        branch: { select: { id: true, code: true, name: true } },
        role: { select: { id: true, key: true, name: true } },
      },
    });
  }

  async deleteBranch(id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id }, select: { id: true } });
    if (!branch) throw new NotFoundException('BRANCH_NOT_FOUND');
    await this.prisma.branch.delete({ where: { id } });
  }

  async removeBranchRole(id: string) {
    const record = await this.prisma.userBranchRole.findUnique({ where: { id }, select: { id: true } });
    if (!record) throw new NotFoundException('ASSIGNMENT_NOT_FOUND');
    await this.prisma.userBranchRole.delete({ where: { id } });
  }
}
