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
  const f1 = path.join(DIR, 'seq4-a.xlsx');
  const f2 = path.join(DIR, 'seq4-b.xlsx');
  await buildFile(f1, ['A', 'B'], [[1, 2]]);
  await buildFile(f2, ['A', 'B'], [[3, 4]]);

  await readFile(f1, 'read 1');
  await new Promise(r => setTimeout(r, 200));
  await readFile(f2, 'read 2');
}

main().catch(err => { console.error('CRASHED:', err); process.exit(1); });
