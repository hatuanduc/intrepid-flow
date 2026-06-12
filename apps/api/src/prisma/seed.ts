import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    },
  },
});

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@intrepid.com';
  const password = process.env.DEMO_PASSWORD ?? 'intrepid';
  const hashed = bcrypt.hashSync(password, 10);
  const corePermissions = [
    { key: 'dashboard:view',  module: 'dashboard', action: 'view',   label: 'Xem tổng quan' },
    { key: 'users:view',      module: 'users',     action: 'view',   label: 'Xem danh sách người dùng' },
    { key: 'users:create',    module: 'users',     action: 'create', label: 'Tạo người dùng' },
    { key: 'users:update',    module: 'users',     action: 'update', label: 'Cập nhật người dùng' },
    { key: 'roles:view',      module: 'roles',     action: 'view',   label: 'Xem vai trò' },
    { key: 'roles:create',    module: 'roles',     action: 'create', label: 'Tạo vai trò' },
    { key: 'roles:update',    module: 'roles',     action: 'update', label: 'Cập nhật vai trò' },
    { key: 'modules:view',    module: 'modules',   action: 'view',   label: 'Xem danh sách quy trình' },
  ];

  const initialWorkflowModules = [
    {
      key: 'bank_statement',
      name: 'Sao kê ngân hàng',
      description: 'Tự động lấy sao kê từ cổng ngân hàng điện tử và đồng bộ vào hệ thống.',
      sortOrder: 1,
    },
    {
      key: 'gmail_invoice',
      name: 'Hóa đơn từ Gmail',
      description: 'Tự động quét và trích xuất hóa đơn từ tài khoản Gmail được ủy quyền.',
      sortOrder: 2,
    },
  ];

  // Seed workflow modules first (permissions reference their names)
  for (const wm of initialWorkflowModules) {
    await prisma.workflowModule.upsert({
      where: { key: wm.key },
      create: { ...wm, isEnabled: false },
      update: { name: wm.name, description: wm.description, sortOrder: wm.sortOrder },
    });
  }

  // Core permissions + per-workflow-module permissions
  const workflowModulePerms = initialWorkflowModules.flatMap(wm => [
    { key: `${wm.key}:view`,   module: wm.key, action: 'view',   label: `Xem ${wm.name}` },
    { key: `${wm.key}:manage`, module: wm.key, action: 'manage', label: `Quản lý ${wm.name}` },
  ]);

  for (const permission of [...corePermissions, ...workflowModulePerms]) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: { label: permission.label },
    });
  }

  const adminRole = await prisma.role.upsert({
    where: { key: 'admin' },
    create: {
      key: 'admin',
      name: 'Quản trị hệ thống',
      description: 'Toàn quyền quản trị cửa hàng',
      isSystem: true,
    },
    update: {
      name: 'Quản trị hệ thống',
      description: 'Toàn quyền quản trị cửa hàng',
      isSystem: true,
    },
  });

  const allPermissions = await prisma.permission.findMany({
    select: { id: true },
  });

  await prisma.rolePermission.deleteMany({
    where: { roleId: adminRole.id },
  });

  if (allPermissions.length > 0) {
    await prisma.rolePermission.createMany({
      data: allPermissions.map((permission) => ({
        roleId: adminRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: 'Admin',
      password: hashed,
      isActive: true,
    },
    update: {
      name: 'Admin',
      password: hashed,
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: adminRole.id,
      },
    },
    create: {
      userId: user.id,
      roleId: adminRole.id,
    },
    update: {},
  });

  console.log('Seed user ready:', user.email);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
