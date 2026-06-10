import { Body, Controller, Get, Post, Put, Delete, Param, UseGuards } from '@nestjs/common';
import { BranchesService } from './branches.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('management')
@UseGuards(JwtAuthGuard)
export class BranchesController {
  constructor(private branches: BranchesService) {}

  // --- Branches ---

  @Get('branches')
  async getBranches() {
    const items = await this.branches.listBranches();
    return { items };
  }

  @Post('branches')
  async postBranch(@Body() body: any) {
    const { code, name, address } = body;
    const branch = await this.branches.createBranch({ code, name, address });
    return { item: branch };
  }

  @Put('branches/:id')
  async putBranch(@Param('id') id: string, @Body() body: any) {
    const { name, address, isActive } = body;
    const branch = await this.branches.updateBranch(id, { name, address, isActive });
    return { item: branch };
  }

  @Delete('branches/:id')
  async deleteBranch(@Param('id') id: string) {
    await this.branches.deleteBranch(id);
    return { success: true };
  }

  // --- UserBranchRoles ---

  @Get('users/:userId/branch-roles')
  async getUserBranchRoles(@Param('userId') userId: string) {
    const items = await this.branches.listUserBranchRoles(userId);
    return {
      items: items.map((r) => ({
        id: r.id,
        branch: r.branch,
        role: r.role,
        assignedAt: r.assignedAt,
      })),
    };
  }

  @Post('users/:userId/branch-roles')
  async assignBranchRole(@Param('userId') userId: string, @Body() body: any) {
    const { branchId, roleId } = body;
    const item = await this.branches.assignBranchRole({ userId, branchId, roleId });
    return { item };
  }

  @Delete('users/branch-roles/:id')
  async removeBranchRole(@Param('id') id: string) {
    await this.branches.removeBranchRole(id);
    return { success: true };
  }
}
