/* eslint-disable no-console */
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';

const DIR = 'C:/Users/PC025-1/AppData/Local/Temp/claude/d--github-private-intrepid-flow/048d0c73-8095-4d63-b872-f67cf33fb824/scratchpad/reconcile-db-test';

async function main() {
  fs.mkdirSync(DIR, { recursive: true });
  const masterFile = path.join(DIR, 'master-only.xlsx');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Brand name', 'Customer name']);
  ws.addRow(['BRANDX', 'CONG TY X MOI']);
  ws.addRow(['BRANDY', 'CONG TY Y MOI']);
  ws.addRow(['BRANDY', 'DUPLICATE-SHOULD-BE-IGNORED']);
  await wb.xlsx.writeFile(masterFile);
  console.log('wrote', masterFile);

  const reader = new ExcelJS.stream.xlsx.WorkbookReader(masterFile, {});
  let sheetIdx = 0;
  for await (const worksheet of reader) {
    console.log('worksheet', sheetIdx++);
    for await (const row of worksheet) {
      console.log('row', row.number, row.values);
    }
  }
  console.log('DONE - no crash');
}

main().catch(err => { console.error('CRASHED:', err); process.exit(1); });
