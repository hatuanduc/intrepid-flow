import ExcelJS from 'exceljs';

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

type TxRow = {
  bankRef: string;
  narrative: string;
  customerRef: string | null;
  trnType: string;
  credit: number | null;
  debit: number | null;
  balance: number;
  postDate: string;
};

// Per-account transaction templates (3 days: 28, 29, 30 Jun 2026)
const ACCOUNT_TRANSACTIONS: Record<string, TxRow[]> = {
  '652-138066-838/SA-EUR': [
    { bankRef: 'EUR20260630001', narrative: 'INTREPID HK EUR INCOMING SWIFT',    customerRef: 'CUST-HK-630', trnType: 'RT PYMT', credit: 1500.00, debit: null,    balance: 1501.08, postDate: '30/06/2026' },
    { bankRef: 'EUR20260629001', narrative: 'INTREPID HK EUR TRANSFER IN',        customerRef: 'CUST-HK-629', trnType: 'RT PYMT', credit: 320.50,  debit: null,    balance:    1.08, postDate: '29/06/2026' },
    { bankRef: 'EUR20260629002', narrative: 'HSBC EUR SERVICE CHARGE',            customerRef: null,          trnType: 'Transfer', credit: null,    debit: 45.00,   balance: -319.42, postDate: '29/06/2026' },
    { bankRef: 'EUR20260628001', narrative: 'INTREPID HK EUR PAYMENT RECEIVED',   customerRef: 'CUST-HK-628', trnType: 'RT PYMT', credit: 800.00,  debit: null,    balance:  800.00, postDate: '28/06/2026' },
  ],
  '652-138066-838/CU-HKD': [
    { bankRef: 'HKD20260630001', narrative: 'HKD INTERNAL TRANSFER',              customerRef: null,          trnType: 'Transfer', credit: null,    debit: 100.00,  balance:    0.00, postDate: '30/06/2026' },
    { bankRef: 'HKD20260629001', narrative: 'HKD COLLECTION',                     customerRef: 'CUST-CU-629', trnType: 'RT PYMT', credit: 100.00,  debit: null,    balance:  100.00, postDate: '29/06/2026' },
  ],
  '652-138066-838/SA-HKD': [
    { bankRef: 'HKD20260630010', narrative: 'ECOMM SETTLEMENT HK SA-HKD',         customerRef: 'CUST-SH-630', trnType: 'RT PYMT', credit: 5200.00, debit: null,    balance: 14434.06, postDate: '30/06/2026' },
    { bankRef: 'HKD20260630011', narrative: 'SUPPLIER PAYMENT MOCK CO LTD',       customerRef: null,          trnType: 'Transfer', credit: null,    debit: 1800.00, balance:  9234.06, postDate: '30/06/2026' },
    { bankRef: 'HKD20260629010', narrative: 'PLATFORM FEE SETTLEMENT',            customerRef: 'CUST-SH-629', trnType: 'RT PYMT', credit: 3400.00, debit: null,    balance: 11034.06, postDate: '29/06/2026' },
    { bankRef: 'HKD20260629011', narrative: 'LOGISTICS CHARGE MOCK EXPRESS',      customerRef: null,          trnType: 'Transfer', credit: null,    debit:  560.00, balance:  7634.06, postDate: '29/06/2026' },
    { bankRef: 'HKD20260628010', narrative: 'MARKETPLACE PAYOUT HK',              customerRef: 'CUST-SH-628', trnType: 'RT PYMT', credit: 8194.06, debit: null,    balance:  8194.06, postDate: '28/06/2026' },
  ],
  '652-138066-838/SA-USD': [
    { bankRef: 'USD20260630001', narrative: 'USD WIRE TRANSFER IN',               customerRef: 'CUST-US-630', trnType: 'RT PYMT', credit:   50.00, debit: null,    balance:   35.71, postDate: '30/06/2026' },
    { bankRef: 'USD20260629001', narrative: 'USD CORRESPONDENT CHARGE',           customerRef: null,          trnType: 'Transfer', credit: null,    debit:   14.29, balance:  -14.29, postDate: '29/06/2026' },
    { bankRef: 'USD20260628001', narrative: 'USD INCOMING PAYMENT',               customerRef: 'CUST-US-628', trnType: 'RT PYMT', credit:  500.00, debit: null,    balance:  500.00, postDate: '28/06/2026' },
  ],
  '050-300672-068': [
    { bankRef: 'IDR20260630001', narrative: '/ORDP/PT MOCK MITRA/OBK/970422/',    customerRef: '6306IDR1A001', trnType: 'RT PYMT', credit: 450000000, debit: null,        balance: 3128250856, postDate: '30/06/2026' },
    { bankRef: 'IDR20260630002', narrative: 'STANDING INSTRUCTION INTERNAL',      customerRef: 'NONREF',       trnType: 'Transfer', credit: null,       debit: -1315106411, balance: 2678250856, postDate: '30/06/2026' },
    { bankRef: 'IDR20260629001', narrative: '/ORDP/PT MOCK DIGITAL/OBK/970422/',  customerRef: '6296IDR1B001', trnType: 'RT PYMT', credit: 299989200,  debit: null,        balance: 3993357267, postDate: '29/06/2026' },
    { bankRef: 'IDR20260629002', narrative: '/ORDP/MBBANK IBFT MOCK TRANSFER/',   customerRef: '6296IDR1C001', trnType: 'RT PYMT', credit: 200000000,  debit: null,        balance: 3693368067, postDate: '29/06/2026' },
    { bankRef: 'IDR20260628001', narrative: 'MARKETPLACE PAYOUT IDR LAZADA',      customerRef: 'CUST-ID-628',  trnType: 'RT PYMT', credit: 500000000,  debit: null,        balance: 3493368067, postDate: '28/06/2026' },
    { bankRef: 'IDR20260628002', narrative: 'SUPPLIER PAYMENT IDR MOCK',          customerRef: null,           trnType: 'Transfer', credit: null,       debit: 150000000,   balance: 2993368067, postDate: '28/06/2026' },
  ],
  '050-300672-069': [
    { bankRef: 'IDR20260630010', narrative: '/ORDP/PT MOCK ECOMM/OBK/970422/',   customerRef: '6306IDR2A001', trnType: 'RT PYMT', credit: 350000000,  debit: null,        balance: 1363989810, postDate: '30/06/2026' },
    { bankRef: 'IDR20260629010', narrative: 'SHOPEE PAYOUT IDR SETTLEMENT',      customerRef: 'CUST-ID2-629', trnType: 'RT PYMT', credit: 180000000,  debit: null,        balance: 1013989810, postDate: '29/06/2026' },
    { bankRef: 'IDR20260628010', narrative: 'TOKOPEDIA PAYOUT SETTLEMENT',       customerRef: 'CUST-ID2-628', trnType: 'RT PYMT', credit: 300000000,  debit: null,        balance:  833989810, postDate: '28/06/2026' },
  ],
  '050-300672-115': [
    { bankRef: 'USD20260630010', narrative: 'USD TRANSFER INTREPID ID',          customerRef: 'CUST-IDU-630', trnType: 'RT PYMT', credit:  200.00, debit: null,   balance: 450.00, postDate: '30/06/2026' },
    { bankRef: 'USD20260629010', narrative: 'USD WIRE CORRESPONDENT',            customerRef: null,           trnType: 'Transfer', credit: null,    debit: 50.00,  balance: 250.00, postDate: '29/06/2026' },
    { bankRef: 'USD20260628010', narrative: 'USD INCOMING CROSS BORDER',         customerRef: 'CUST-IDU-628', trnType: 'RT PYMT', credit:  300.00, debit: null,   balance: 300.00, postDate: '28/06/2026' },
  ],
  '352-663561-101': [
    { bankRef: 'MYR20260630001', narrative: 'SHOPEE MY PAYOUT SETTLEMENT',       customerRef: 'CUST-MY-630', trnType: 'RT PYMT', credit: 45000.00,  debit: null,     balance: 260515.35, postDate: '30/06/2026' },
    { bankRef: 'MYR20260630002', narrative: 'LAZADA MY PAYOUT SETTLEMENT',       customerRef: 'CUST-MY-630', trnType: 'RT PYMT', credit: 28500.00,  debit: null,     balance: 215515.35, postDate: '30/06/2026' },
    { bankRef: 'MYR20260629001', narrative: 'SUPPLIER PAYMENT MY MOCK SDN',      customerRef: null,          trnType: 'Transfer', credit: null,       debit: 12000.00, balance: 187015.35, postDate: '29/06/2026' },
    { bankRef: 'MYR20260629002', narrative: 'TIKTOK MY PAYOUT SETTLEMENT',       customerRef: 'CUST-MY-629', trnType: 'RT PYMT', credit: 15800.00,  debit: null,     balance: 199015.35, postDate: '29/06/2026' },
    { bankRef: 'MYR20260628001', narrative: 'MARKETPLACE PAYOUT MALAYSIA',       customerRef: 'CUST-MY-628', trnType: 'RT PYMT', credit: 183215.35, debit: null,     balance: 183215.35, postDate: '28/06/2026' },
  ],
  '352-663561-725': [
    { bankRef: 'USD20260630020', narrative: 'USD MY INCOMING SWIFT',             customerRef: 'CUST-MYU-630', trnType: 'RT PYMT', credit: 10.00, debit: null,  balance: 20.27, postDate: '30/06/2026' },
    { bankRef: 'USD20260628020', narrative: 'USD MY BANK CHARGE',                customerRef: null,           trnType: 'Transfer', credit: null,  debit:  5.00, balance: 10.27, postDate: '28/06/2026' },
  ],
  '026-329243-040': [
    { bankRef: 'PHP20260630001', narrative: 'SHOPEE PH PAYOUT SETTLEMENT',       customerRef: 'CUST-PH-630', trnType: 'RT PYMT', credit: 850000.00, debit: null,      balance: 5281100.75, postDate: '30/06/2026' },
    { bankRef: 'PHP20260630002', narrative: 'LAZADA PH PAYOUT SETTLEMENT',       customerRef: 'CUST-PH-630', trnType: 'RT PYMT', credit: 420000.00, debit: null,      balance: 4431100.75, postDate: '30/06/2026' },
    { bankRef: 'PHP20260629001', narrative: 'SUPPLIER PAYMENT PH MOCK INC',      customerRef: null,          trnType: 'Transfer', credit: null,       debit: 200000.00, balance: 4011100.75, postDate: '29/06/2026' },
    { bankRef: 'PHP20260629002', narrative: 'TIKTOK PH PAYOUT SETTLEMENT',       customerRef: 'CUST-PH-629', trnType: 'RT PYMT', credit: 310000.00, debit: null,      balance: 4211100.75, postDate: '29/06/2026' },
    { bankRef: 'PHP20260628001', narrative: 'MARKETPLACE INITIAL SETTLEMENT',    customerRef: 'CUST-PH-628', trnType: 'RT PYMT', credit: 3901100.75, debit: null,     balance: 3901100.75, postDate: '28/06/2026' },
  ],
  '026-329243-041': [
    { bankRef: 'PHP20260630010', narrative: 'SHOPEE PH SUBSIDIARY PAYOUT',       customerRef: 'CUST-PH2-630', trnType: 'RT PYMT', credit: 25000.00, debit: null,     balance: 43812.29, postDate: '30/06/2026' },
    { bankRef: 'PHP20260629010', narrative: 'PHP INCOMING TRANSFER PH2',         customerRef: 'CUST-PH2-629', trnType: 'RT PYMT', credit: 15000.00, debit: null,     balance: 18812.29, postDate: '29/06/2026' },
    { bankRef: 'PHP20260628010', narrative: 'PHP INITIAL DEPOSIT SUBSIDIARY',    customerRef: 'CUST-PH2-628', trnType: 'RT PYMT', credit:  3812.29, debit: null,     balance:  3812.29, postDate: '28/06/2026' },
  ],
};

// Country code → Location name mapping
const COUNTRY_LOCATIONS: Record<string, string> = {
  HK: 'Hong Kong SAR HBAP',
  ID: 'Indonesia HBAP',
  MY: 'Malaysia HBMB',
  PH: 'Philippines HBAP',
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const accountNumber = url.searchParams.get('acc') ?? '652-138066-838/SA-EUR';
  const currency     = url.searchParams.get('cur') ?? 'EUR';
  const countryCode  = url.searchParams.get('co')  ?? 'HK';
  const company      = url.searchParams.get('name') ?? 'INTREPID E-COMMERCE HONG KONG LTD';
  const bankName     = url.searchParams.get('bank') ?? 'Hongkong Shanghai Banking Corp Ltd';
  const location     = COUNTRY_LOCATIONS[countryCode] ?? countryCode;

  const transactions = ACCOUNT_TRANSACTIONS[accountNumber] ?? ACCOUNT_TRANSACTIONS['652-138066-838/SA-EUR'];

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
    '28/06/2026',
    closingBalance,
    '28/06/2026',
    closingBalance,
    '30/06/2026 08:00',
    closingBalance,
    '30/06/2026 08:00',
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
