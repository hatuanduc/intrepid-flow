import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
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
  const email = process.env.SEED_ADMIN_EMAIL ?? 'adminintrepid@gmail.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'intrepid';
  const hashed = bcrypt.hashSync(password, 10);
  const corePermissions = [
    { key: 'dashboard:view',  module: 'dashboard', action: 'view',   label: 'Xem tổng quan' },
    { key: 'users:view',      module: 'users',     action: 'view',   label: 'Xem danh sách người dùng' },
    { key: 'users:create',    module: 'users',     action: 'create', label: 'Tạo người dùng' },
    { key: 'users:update',    module: 'users',     action: 'update', label: 'Cập nhật người dùng' },
    { key: 'roles:view',      module: 'roles',     action: 'view',   label: 'Xem vai trò' },
    { key: 'roles:create',    module: 'roles',     action: 'create', label: 'Tạo vai trò' },
    { key: 'roles:update',    module: 'roles',     action: 'update', label: 'Cập nhật vai trò' },
  ];

  for (const permission of corePermissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      create: permission,
      update: { label: permission.label },
    });
  }

  const adminRole = await prisma.role.upsert({
    where: { key: 'superadmin' },
    create: {
      key: 'superadmin',
      name: 'Super Admin',
      description: 'Toàn quyền quản trị hệ thống',
      isSystem: true,
    },
    update: {
      name: 'Super Admin',
      description: 'Toàn quyền quản trị hệ thống',
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

  // Mock users for testing pagination — only seeded when SEED_MOCK_USERS=true (local dev)
  if (process.env.SEED_MOCK_USERS === 'true') {
    const mockUsers = [
      'Nguyễn Văn An', 'Trần Thị Bình', 'Lê Văn Cường', 'Phạm Thị Dung', 'Hoàng Văn Em',
      'Đặng Thị Phương', 'Bùi Văn Giang', 'Vũ Thị Hà', 'Đỗ Văn Inh', 'Ngô Thị Kim',
      'Dương Văn Long', 'Lý Thị Mai', 'Trịnh Văn Nam', 'Phan Thị Oanh', 'Võ Văn Phúc',
      'Đinh Thị Quỳnh', 'Lưu Văn Sơn', 'Tạ Thị Thủy', 'Hà Văn Ước', 'Mai Thị Vân',
      'Cao Văn Xuân', 'Tô Thị Yến', 'Chu Văn Zung', 'Nông Thị Ánh', 'Thái Văn Bảo',
    ];

    for (let i = 0; i < mockUsers.length; i++) {
      const mockEmail = `user${i + 1}@intrepid.com`;
      const mockUser = await prisma.user.upsert({
        where: { email: mockEmail },
        create: {
          email: mockEmail,
          name: mockUsers[i],
          password: hashed,
          isActive: i % 5 !== 0, // 1 out of every 5 users is locked
        },
        update: { name: mockUsers[i] },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: mockUser.id, roleId: adminRole.id } },
        create: { userId: mockUser.id, roleId: adminRole.id },
        update: {},
      });
    }
    console.log(`Seeded ${mockUsers.length} mock users`);
  } else {
    console.log('Skipped mock users (SEED_MOCK_USERS not enabled)');
  }

  // ─── Bank Statement defaults ────────────────────────────────────────────────
  await prisma.bankJobSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', scheduleCron: '30 9 * * *', isScheduled: true },
    update: {},
  });

  const HSBC_HEADERS = [
    'Account name', 'Account number', 'Bank name', 'Currency', 'Location',
    'BIC', 'IBAN', 'Account status', 'Account type',
    'Closing ledger balance', 'Closing ledger brought forward from',
    'Closing available balance', 'Closing available brought forward from',
    'Current ledger balance', 'Current ledger as at',
    'Current available balance', 'Current available as at',
    'Bank reference', 'Narrative', 'Customer reference', 'TRN type',
    'Credit amount', 'Debit amount', 'Balance', 'Post date',
  ];
  const headerHash = crypto.createHash('sha256').update(HSBC_HEADERS.join('|')).digest('hex');

  await prisma.bankDownloadTemplate.upsert({
    where: { name: 'hsbcnet_transaction' },
    create: { name: 'hsbcnet_transaction', headers: HSBC_HEADERS, headerHash },
    update: {},
  });

  console.log('Bank statement defaults seeded');

  // ─── Bank Account Names (master data — account number is discovered by the sync job) ───
  const BANK_ACCOUNT_NAMES = [
    { name: 'INTREPID VIETNAM LTD',         accountCode: 'VN' },
    { name: 'INTREPID MALAYSIA SDN. BHD',   accountCode: 'MY' },
    { name: 'INTREPID DIGITAL I PT',        accountCode: 'ID' },
    { name: 'INTREPID PHILIPPINES INC.',    accountCode: 'PH' },
    { name: 'DATAMART VIET NAM CO., LTD',   accountCode: 'DMX_VN' },
    { name: 'INTREPID DIGITAL COMMERCE PL', accountCode: 'SG' },
    { name: 'INTREPID ECOMMERCE SERVICES',  accountCode: 'TH' },
  ];

  for (const a of BANK_ACCOUNT_NAMES) {
    await prisma.bankAccountName.upsert({
      where: { name: a.name },
      create: a,
      update: { accountCode: a.accountCode },
    });
  }
  console.log(`Seeded ${BANK_ACCOUNT_NAMES.length} bank account names`);

  // ─── Currency Rates (defaults) ──────────────────────────────────────────────
  // VND is not published by frankfurter.app (ECB reference rates), so it can't be
  // auto-refreshed like other currencies — seed a default rate here instead.
  await prisma.currencyRate.upsert({
    where: { currency: 'VND' },
    create: { currency: 'VND', rateToUsd: '0.0000385' },
    update: {},
  });
  console.log('Seeded default VND currency rate');

  // ─── Reconcile Settings (defaults) ──────────────────────────────────────────
  await prisma.reconcileSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default' },
    update: {},
  });
  console.log('Reconcile settings defaults seeded');
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
