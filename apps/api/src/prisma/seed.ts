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
  const defaultPermissions = [
    { key: 'dashboard:view', module: 'dashboard', action: 'view', label: 'Xem tổng quan' },
    { key: 'users:view', module: 'users', action: 'view', label: 'Xem danh sách người dùng' },
    { key: 'users:create', module: 'users', action: 'create', label: 'Tạo người dùng' },
    { key: 'users:update', module: 'users', action: 'update', label: 'Cập nhật người dùng' },
    { key: 'roles:view', module: 'roles', action: 'view', label: 'Xem vai trò' },
    { key: 'roles:create', module: 'roles', action: 'create', label: 'Tạo vai trò' },
    { key: 'roles:update', module: 'roles', action: 'update', label: 'Cập nhật vai trò' },
  ];

  for (const permission of defaultPermissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: {
        module: permission.module,
        action: permission.action,
        label: permission.label,
      },
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
