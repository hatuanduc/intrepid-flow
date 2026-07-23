import ExcelJS from 'exceljs';
import { getAccountTransactions, parseDMY, daysAgoDMY } from '../../../mock-hsbc/_data';

// Column order matches real HSBC export exactly
const HEADERS = [
  'Account name', 'Account number', 'Bank name', 'Currency', 'Location', 'BIC', 'IBAN',
  'Account status', 'Account type',
  'Closing ledger balance', 'Closing ledger brought forward from',
  'Closing available balance', 'Closing available brought forward from',
  'Current ledger balance', 'Current ledger as at',
  'Current available balance', 'Current available as at',
  'Bank reference', 'Narrative', 'Customer reference', 'TRN type',
  'Credit amount', 'Debit amount', 'Balance',
  'Post date',  // last column — as in real file
];

// Country code → Location name mapping
const COUNTRY_LOCATIONS: Record<string, string> = {
  VN: 'Vietnam HBVN',
  DMX_VN: 'Vietnam HBVN',
  ID: 'Indonesia HBAP',
  MY: 'Malaysia HBMB',
  PH: 'Philippines HBAP',
  SG: 'Singapore HBSP',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountNumber = url.searchParams.get('acc') ?? '001-123456-001';
  const currency     = url.searchParams.get('cur') ?? 'VND';
  const countryCode  = url.searchParams.get('co')  ?? 'VN';
  const company      = url.searchParams.get('name') ?? 'INTREPID VIETNAM LTD';
  const bankName     = url.searchParams.get('bank') ?? 'HSBC Bank (Vietnam) Ltd';
  const fromParam    = url.searchParams.get('from') ?? '';
  const toParam      = url.searchParams.get('to')   ?? '';
  const location     = COUNTRY_LOCATIONS[countryCode] ?? countryCode;

  const accountTransactions = getAccountTransactions();
  let transactions = accountTransactions[accountNumber] ?? accountTransactions['001-123456-001'];

  if (fromParam && toParam) {
    const from = parseDMY(fromParam);
    const to   = parseDMY(toParam);
    transactions = transactions.filter((t) => {
      const d = parseDMY(t.postDate);
      return d >= from && d <= to;
    });
  }

  const closingBalance = String(transactions[0]?.balance ?? 0);

  // Shared account metadata (repeated on every row — same as real HSBC format)
  const accountMeta = [
    company,
    accountNumber,
    bankName,
    currency,
    location,
    'HSBCHKHHHKH',
    'Not Available',
    'Active',
    'Current account',
    closingBalance,
    fromParam || daysAgoDMY(2),
    closingBalance,
    fromParam || daysAgoDMY(2),
    closingBalance,
    `${toParam || daysAgoDMY(0)} 08:00`,
    closingBalance,
    `${toParam || daysAgoDMY(0)} 08:00`,
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');

  // Row 1: headers — ExcelService identifies via 'Post date' AND 'Bank reference'
  ws.addRow(HEADERS);

  // Rows 2+: one row per transaction, account metadata repeated
  for (const txn of transactions) {
    ws.addRow([
      ...accountMeta,
      txn.bankRef,
      txn.narrative,
      txn.customerRef,
      txn.trnType,
      txn.credit,
      txn.debit,
      txn.balance,
      txn.postDate,
    ]);
  }

  const buffer = await wb.xlsx.writeBuffer();

  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="AISTMTPRINT-${accountNumber.replace(/\//g, '-')}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
