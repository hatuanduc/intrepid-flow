import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const CORE_PERMISSIONS = [
  { key: 'dashboard:view',          module: 'dashboard',       action: 'view',        label: 'Xem tổng quan' },
  { key: 'users:view',              module: 'users',           action: 'view',        label: 'Xem danh sách người dùng' },
  { key: 'users:create',            module: 'users',           action: 'create',      label: 'Tạo người dùng' },
  { key: 'users:update',            module: 'users',           action: 'update',      label: 'Cập nhật người dùng' },
  { key: 'users:impersonate',       module: 'users',           action: 'impersonate', label: 'Đăng nhập với tư cách người dùng khác' },
  { key: 'roles:view',              module: 'roles',           action: 'view',        label: 'Xem vai trò' },
  { key: 'permissions:view',        module: 'permissions',     action: 'view',        label: 'Xem danh sách quyền hạn' },
  { key: 'bank_statement:view',     module: 'bank_statement',  action: 'view',        label: 'Xem sao kê ngân hàng' },
  { key: 'bank_statement:run',      module: 'bank_statement',  action: 'run',         label: 'Chạy đồng bộ sao kê' },
  { key: 'bank_statement:config',   module: 'bank_statement',  action: 'config',      label: 'Cấu hình sao kê ngân hàng' },
  { key: 'report_ar:view',          module: 'report_ar',       action: 'view',        label: 'Xem báo cáo AR' },
  { key: 'report_ar:config',        module: 'report_ar',       action: 'config',      label: 'Cấu hình báo cáo AR' },
  { key: 'system:config',           module: 'system',          action: 'config',      label: 'Cấu hình hệ thống (kết nối, secret keys)' },
];

// null permissionKeys = tất cả permissions (Administrator)
const CORE_ROLES = [
  {
    key: 'admin',
    name: 'Administrator',
    group: 'admin',
    description: 'Toàn quyền hệ thống — quản lý người dùng, cấu hình kết nối, thực hiện mọi thao tác.',
    isSystem: true,
    permissionKeys: null as string[] | null,
  },
  {
    key: 'manager',
    name: 'Manager',
    group: 'admin',
    description: 'Quản lý người dùng và vận hành. Không thể truy cập cấu hình kết nối và secret keys.',
    isSystem: true,
    permissionKeys: [
      'dashboard:view',
      'users:view', 'users:create', 'users:update', 'users:impersonate',
      'roles:view', 'permissions:view',
      'bank_statement:view', 'bank_statement:run', 'bank_statement:config',
      'report_ar:view', 'report_ar:config',
    ],
  },
  {
    key: 'operator',
    name: 'Operator',
    group: 'operations',
    description: 'Chạy đồng bộ sao kê và xem báo cáo. Không thể quản lý người dùng hay cài đặt hệ thống.',
    isSystem: true,
    permissionKeys: [
      'dashboard:view',
      'bank_statement:view', 'bank_statement:run',
      'report_ar:view',
    ],
  },
  {
    key: 'viewer',
    name: 'View Only',
    group: 'view_only',
    description: 'Chỉ xem dữ liệu — tổng quan, sao kê, báo cáo. Không thể thực hiện bất kỳ thao tác nào.',
    isSystem: true,
    permissionKeys: [
      'dashboard:view',
      'bank_statement:view',
      'report_ar:view',
    ],
  },
];

@Injectable()
export class PermissionsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.syncPermissions();
    await this.syncRoles();
  }

  async syncPermissions() {
    for (const p of CORE_PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { key: p.key },
        create: p,
        update: { label: p.label },
      });
    }
    this.logger.log(`Permissions synced: ${CORE_PERMISSIONS.length} core`);
  }

  async syncRoles() {
    // 1. Upsert role records
    for (const r of CORE_ROLES) {
      await this.prisma.role.upsert({
        where: { key: r.key },
        create: { key: r.key, name: r.name, group: r.group, description: r.description, isSystem: r.isSystem },
        update: { name: r.name, group: r.group, description: r.description, isSystem: r.isSystem },
      });
    }

    // 2. Rebuild permissions for each role from definition
    const allPermissions = await this.prisma.permission.findMany({ select: { id: true, key: true } });
    const permByKey = Object.fromEntries(allPermissions.map(p => [p.key, p.id]));

    for (const r of CORE_ROLES) {
      const role = await this.prisma.role.findUnique({ where: { key: r.key }, select: { id: true } });
      if (!role) continue;

      const permIds = r.permissionKeys === null
        ? allPermissions.map(p => p.id)
        : r.permissionKeys.map(k => permByKey[k]).filter((id): id is string => !!id);

      await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permIds.length > 0) {
        await this.prisma.rolePermission.createMany({
          data: permIds.map(permissionId => ({ roleId: role.id, permissionId })),
        });
      }
    }

    this.logger.log(`Roles synced: ${CORE_ROLES.length} core roles`);
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] });
  }
}
