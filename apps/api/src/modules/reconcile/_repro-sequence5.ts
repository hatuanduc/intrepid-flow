/* eslint-disable no-console */
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';

const DIR = 'C:/Users/PC025-1/AppData/Local/Temp/claude/d--github-private-intrepid-flow/048d0c73-8095-4d63-b872-f67cf33fb824/scratchpad/reconcile-db-test';

async function buildFile(filePath: string, headers: string[], rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(headers);
  rows.forEach(r => ws.addRow(r));
  await wb.xlsx.writeFile(filePath);
}

async function readFile(filePath: string, label: string) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {});
  let count = 0;
  for await (const worksheet of reader) {
    for await (const row of worksheet) { count += row.values ? 1 : 0; }
  }
  console.log(label, 'OK, rows seen:', count);
}

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const f1 = path.join(DIR, 'seq5-a.xlsx');
  const f2 = path.join(DIR, 'seq5-b.xlsx');
  await buildFile(f1,
    ['Tên khách hàng', 'Doanh số bán chưa thuế VNĐ', 'Thuế GTGT đầu ra VNĐ', 'Ghi chú'],
    [['', 1000, 100, 'Retail_x_BRANDA_y'], ['Cty ABC', 2000, 200, 'Service_abc'], ['Nobody', 999, 99, ''], ['Cty XYZ', 300, 30, 'RandomNote']]);
  await buildFile(f2,
    ['Ghi chú', 'Tên khách hàng', 'Doanh số bán chưa thuế VNĐ', 'Thuế GTGT đầu ra VNĐ'],
    [['Service_def', 'Cty ABC', 500, 50], ['Retail_z_BRANDB_w', '', 700, 70]]);

  await readFile(f1, 'read 1 (rich content)');
  await readFile(f2, 'read 2 (rich content)');
}

main().catch(err => { console.error('CRASHED:', err); process.exit(1); });
