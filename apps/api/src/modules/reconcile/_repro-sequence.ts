/* eslint-disable no-console */
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';

const DIR = 'C:/Users/PC025-1/AppData/Local/Temp/claude/d--github-private-intrepid-flow/048d0c73-8095-4d63-b872-f67cf33fb824/scratchpad/reconcile-db-test';

async function main() {
  fs.mkdirSync(DIR, { recursive: true });

  // 1. Build + read an invoice file (like processInvoiceFile does)
  const invoiceFile = path.join(DIR, 'seq-invoice.xlsx');
  const wb1 = new ExcelJS.Workbook();
  const ws1 = wb1.addWorksheet('Sheet1');
  ws1.addRow(['Tên khách hàng', 'Sales', 'Tax', 'Ghi chú']);
  ws1.addRow(['Cty A', 100, 10, 'Service_a']);
  await wb1.xlsx.writeFile(invoiceFile);

  const reader1 = new ExcelJS.stream.xlsx.WorkbookReader(invoiceFile, {});
  for await (const worksheet of reader1) {
    for await (const row of worksheet) { void row; }
  }
  console.log('step 1 OK - read invoice file');

  // 2. Build + commit an output workbook (like buildOutputWorkbook does)
  const outPath = path.join(DIR, 'seq-out.xlsx');
  const writer = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: outPath, useStyles: true, useSharedStrings: true });
  const wsOut = writer.addWorksheet('Summary');
  wsOut.addRow(['hello', 1, 2]).commit();
  wsOut.commit();
  await writer.commit();
  console.log('step 2 OK - wrote output file');

  // 3. Now try reading a fresh master file
  const masterFile = path.join(DIR, 'seq-master.xlsx');
  const wb2 = new ExcelJS.Workbook();
  const ws2 = wb2.addWorksheet('Sheet1');
  ws2.addRow(['Brand name', 'Customer name']);
  ws2.addRow(['BRANDX', 'CONG TY X MOI']);
  await wb2.xlsx.writeFile(masterFile);

  const reader2 = new ExcelJS.stream.xlsx.WorkbookReader(masterFile, {});
  for await (const worksheet of reader2) {
    for await (const row of worksheet) { console.log('master row', row.values); }
  }
  console.log('step 3 OK - read master file after reader+writer sequence');
}

main().catch(err => { console.error('CRASHED:', err); process.exit(1); });
