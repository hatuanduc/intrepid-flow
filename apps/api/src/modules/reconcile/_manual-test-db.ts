/* eslint-disable no-console */
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaService } from '../../prisma/prisma.service';
import { ReconcileService } from './reconcile.service';

const DIR = 'C:/Users/PC025-1/AppData/Local/Temp/claude/d--github-private-intrepid-flow/048d0c73-8095-4d63-b872-f67cf33fb824/scratchpad/reconcile-db-test';

async function buildInvoiceFile(filePath: string, headers: string[], rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(headers);
  rows.forEach(r => ws.addRow(r));
  await wb.xlsx.writeFile(filePath);
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const prisma = new PrismaService();
  await prisma.$connect();
  const service = new ReconcileService(prisma);

  const checks: Array<[string, boolean]> = [];

  // ── 1. Seed master data directly, confirm getMasterCustomerInfo + runFilterMerge use it ──
  await prisma.masterCustomerMapping.deleteMany({});
  await prisma.masterCustomerMapping.createMany({
    data: [
      { brandName: 'BRANDA', customerName: 'CONG TY ABC MASTER' },
      { brandName: 'BRANDC', customerName: 'CONG TY C MASTER' },
    ],
  });

  const info1 = await service.getMasterCustomerInfo();
  console.log('Info after seeding 2 rows:', info1);
  checks.push(['getMasterCustomerInfo count=2 after seed', info1.count === 2]);
  checks.push(['getMasterCustomerInfo updatedAt not null', info1.updatedAt !== null]);

  const invoiceFile = path.join(DIR, 'invoice.xlsx');
  await buildInvoiceFile(
    invoiceFile,
    ['Tên khách hàng', 'Doanh số bán chưa thuế VNĐ', 'Thuế GTGT đầu ra VNĐ', 'Ghi chú'],
    [
      ['', 1000, 100, 'Retail_x_BRANDA_y'],   // should map via DB -> CONG TY ABC MASTER
      ['', 500, 50, 'Retail_x_BRANDB_y'],     // not in DB -> fallback to BRANDB
      ['Cty XYZ', 300, 30, 'Service_abc'],
    ],
  );

  const { path: outPath } = await service.runFilterMerge([{ path: invoiceFile, originalName: 'invoice.xlsx' }], {
    headerRow: 1,
    salesColumn: 'Doanh số bán chưa thuế VNĐ',
    taxColumn: 'Thuế GTGT đầu ra VNĐ',
    noteColumn: 'Ghi chú',
    customerColumn: 'Tên khách hàng',
    outputFileName: 'out.xlsx',
  });

  const outWb = new ExcelJS.Workbook();
  await outWb.xlsx.readFile(outPath);
  const summary = outWb.getWorksheet('Summary')!;
  const summaryRows: Record<string, unknown> = {};
  for (let r = 5; r <= summary.rowCount; r++) {
    const vals = summary.getRow(r).values as unknown[];
    if (!vals[1]) continue;
    summaryRows[`${vals[1]}|${vals[4]}`] = { sales: vals[2] };
  }
  console.log('Summary rows (DB-backed run):', summaryRows);
  checks.push(['DB-mapped brand: CONG TY ABC MASTER|RETAIL sales=1000', (summaryRows['CONG TY ABC MASTER|RETAIL'] as any)?.sales === 1000]);
  checks.push(['Unmapped brand fallback: BRANDB|RETAIL sales=500', (summaryRows['BRANDB|RETAIL'] as any)?.sales === 500]);
  fs.unlinkSync(outPath);

  // ── 2. Replace master data wholesale via replaceMasterCustomerData ──
  const masterFile = path.join(DIR, 'master.xlsx');
  await buildInvoiceFile(
    masterFile,
    ['Brand name', 'Customer name'],
    [
      ['BRANDX', 'CONG TY X MOI'],
      ['BRANDY', 'CONG TY Y MOI'],
      ['BRANDY', 'DUPLICATE-SHOULD-BE-IGNORED'], // duplicate brand -> first occurrence wins
    ],
  );

  const replaceResult = await service.replaceMasterCustomerData({ path: masterFile, originalName: 'master.xlsx' });
  console.log('Replace result:', replaceResult);
  checks.push(['replaceMasterCustomerData count=2 (dedup by brand)', replaceResult.count === 2]);

  const oldStillThere = await prisma.masterCustomerMapping.findUnique({ where: { brandName: 'BRANDA' } });
  checks.push(['Old BRANDA row fully replaced (gone)', oldStillThere === null]);

  const newRow = await prisma.masterCustomerMapping.findUnique({ where: { brandName: 'BRANDX' } });
  checks.push(['New BRANDX row present', newRow?.customerName === 'CONG TY X MOI']);

  const dedupedRow = await prisma.masterCustomerMapping.findUnique({ where: { brandName: 'BRANDY' } });
  checks.push(['Duplicate brand kept first occurrence', dedupedRow?.customerName === 'CONG TY Y MOI']);

  // ── 3. Error path: missing required column in master file ──
  const badMaster = path.join(DIR, 'bad-master.xlsx');
  await buildInvoiceFile(badMaster, ['Wrong Col', 'Customer name'], [['a', 'b']]);
  try {
    await service.replaceMasterCustomerData({ path: badMaster, originalName: 'bad-master.xlsx' });
    checks.push(['replaceMasterCustomerData rejects missing Brand column', false]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    checks.push(['replaceMasterCustomerData rejects missing Brand column', msg.includes('Brand name')]);
  }

  let allPass = true;
  for (const [name, pass] of checks) {
    console.log(`${pass ? 'PASS' : 'FAIL'} - ${name}`);
    if (!pass) allPass = false;
  }
  console.log(allPass ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');

  // cleanup seeded data so we don't leave test rows behind
  await prisma.masterCustomerMapping.deleteMany({});
  await prisma.$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
