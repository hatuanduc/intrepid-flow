import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const CORE_PERMISSIONS = [
  { key: 'dashboard:view',  module: 'dashboard', action: 'view',   label: 'Xem tổng quan' },
  { key: 'users:view',      module: 'users',     action: 'view',   label: 'Xem danh sách người dùng' },
  { key: 'users:create',    module: 'users',     action: 'create', label: 'Tạo người dùng' },
  { key: 'users:update',    module: 'users',     action: 'update', label: 'Cập nhật người dùng' },
  { key: 'roles:view',      module: 'roles',     action: 'view',   label: 'Xem vai trò' },
  { key: 'roles:create',    module: 'roles',     action: 'create', label: 'Tạo vai trò' },
  { key: 'roles:update',    module: 'roles',     action: 'update', label: 'Cập nhật vai trò' },
  { key: 'branches:view',   module: 'branches',  action: 'view',   label: 'Xem chi nhánh' },
  { key: 'branches:create', module: 'branches',  action: 'create', label: 'Tạo chi nhánh' },
  { key: 'branches:update', module: 'branches',  action: 'update', label: 'Cập nhật chi nhánh' },
  { key: 'modules:view',    module: 'modules',   action: 'view',   label: 'Xem danh sách quy trình' },
];

@Injectable()
export class PermissionsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.syncPermissions();
  }

  async syncPermissions() {
    // Upsert core permissions
    for (const p of CORE_PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { key: p.key },
        create: p,
        update: { label: p.label },
      });
    }

    // Upsert per-workflow-module permissions
    const workflowModules = await this.prisma.workflowModule.findMany();
    for (const wm of workflowModules) {
      await this.prisma.permission.upsert({
        where: { key: `${wm.key}:view` },
        create: { key: `${wm.key}:view`,   module: wm.key, action: 'view',   label: `Xem ${wm.name}` },
        update: { label: `Xem ${wm.name}` },
      });
      await this.prisma.permission.upsert({
        where: { key: `${wm.key}:manage` },
        create: { key: `${wm.key}:manage`, module: wm.key, action: 'manage', label: `Quản lý ${wm.name}` },
        update: { label: `Quản lý ${wm.name}` },
      });
    }

    this.logger.log(`Permissions synced: ${CORE_PERMISSIONS.length} core + ${workflowModules.length * 2} workflow`);
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  }
}
