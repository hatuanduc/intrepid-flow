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
  ];

  for (const permission of corePermissions) {
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

  // Mock users để test pagination
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
        isActive: i % 5 !== 0, // mỗi 5 user thì 1 bị khóa
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

  // ─── Bank Country Mappings ──────────────────────────────────────────────────
  const COUNTRY_MAPPINGS = [
    { companyName: 'INTREPID VIETNAM LTD',          accountCode: 'VN'    },
    { companyName: 'INTREPID E-COMMERCE HONG KONG LTD', accountCode: 'HK' },
    { companyName: 'INTREPID MALAYSIA SDN. BHD',    accountCode: 'MY'    },
    { companyName: 'INTREPID INDONESIA PT',         accountCode: 'ID'    },
    { companyName: 'INTREPID PHILIPPINES INC.',     accountCode: 'PH'    },
    { companyName: 'INTREPID DIGITAL I PT',         accountCode: 'DM_VN' },
  ];

  for (const m of COUNTRY_MAPPINGS) {
    await prisma.bankCountryMapping.upsert({
      where: { accountCode: m.accountCode },
      create: m,
      update: { companyName: m.companyName },
    });
  }
  console.log(`Seeded ${COUNTRY_MAPPINGS.length} bank country mappings`);

  // ─── Bank Accounts (dev seed) ───────────────────────────────────────────────
  const BANK_ACCOUNTS = [
    // Vietnam
    { accountNumber: '001-123456-001', accountName: 'INTREPID VIETNAM LTD',      bankName: 'HSBC Vietnam',     currency: 'VND', accountCode: 'VN' },
    { accountNumber: '001-123456-002', accountName: 'INTREPID VIETNAM LTD',      bankName: 'HSBC Vietnam',     currency: 'USD', accountCode: 'VN' },
    // Hong Kong
    { accountNumber: '652-138066-838/CU-HKD', accountName: 'INTREPID E-COMMERCE HONG KONG LTD', bankName: 'HSBC Hong Kong', currency: 'HKD', accountCode: 'HK' },
    { accountNumber: '652-138066-838/SA-EUR', accountName: 'INTREPID E-COMMERCE HONG KONG LTD', bankName: 'HSBC Hong Kong', currency: 'EUR', accountCode: 'HK' },
    { accountNumber: '652-138066-838/SA-HKD', accountName: 'INTREPID E-COMMERCE HONG KONG LTD', bankName: 'HSBC Hong Kong', currency: 'HKD', accountCode: 'HK' },
    { accountNumber: '652-138066-838/SA-USD', accountName: 'INTREPID E-COMMERCE HONG KONG LTD', bankName: 'HSBC Hong Kong', currency: 'USD', accountCode: 'HK' },
    // Malaysia
    { accountNumber: '352-663561-101', accountName: 'INTREPID MALAYSIA SDN. BHD', bankName: 'HSBC Malaysia', currency: 'MYR', accountCode: 'MY' },
    { accountNumber: '352-663561-725', accountName: 'INTREPID MALAYSIA SDN. BHD', bankName: 'HSBC Malaysia', currency: 'USD', accountCode: 'MY' },
    // Indonesia
    { accountNumber: '050-300672-068', accountName: 'INTREPID DIGITAL I PT',      bankName: 'HSBC Indonesia',   currency: 'IDR', accountCode: 'ID' },
    { accountNumber: '050-300672-069', accountName: 'INTREPID DIGITAL I PT',      bankName: 'HSBC Indonesia',   currency: 'USD', accountCode: 'ID' },
    // Philippines
    { accountNumber: '026-329243-040', accountName: 'INTREPID PHILIPPINES INC.', bankName: 'HSBC Philippines', currency: 'PHP', accountCode: 'PH' },
    { accountNumber: '026-329243-041', accountName: 'INTREPID PHILIPPINES INC.', bankName: 'HSBC Philippines', currency: 'USD', accountCode: 'PH' },
  ];

  for (const a of BANK_ACCOUNTS) {
    await prisma.bankAccount.upsert({
      where: { accountNumber: a.accountNumber },
      create: { ...a, isActive: true },
      update: { accountName: a.accountName, bankName: a.bankName, currency: a.currency, accountCode: a.accountCode },
    });
  }
  console.log(`Seeded ${BANK_ACCOUNTS.length} bank accounts`);
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
