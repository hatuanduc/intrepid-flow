export type MockAccount = {
  id: string;
  number: string;
  company: string;
  countryLabel: string;
  countryCode: string;
  currency: string;
  balance: string;
  bankName: string;
};

export const MOCK_ACCOUNTS: MockAccount[] = [
  // Vietnam
  { id: 'vn-vnd',    number: '001-123456-001',        company: 'INTREPID VIETNAM LTD',              countryLabel: 'Vietnam HBVN (VND - VIETNAMESE Dong)',       countryCode: 'VN', currency: 'VND', balance: '4,850,320,000.00', bankName: 'HSBC Bank (Vietnam) Ltd' },
  { id: 'vn-usd',    number: '001-123456-002',        company: 'INTREPID VIETNAM LTD',              countryLabel: 'Vietnam HBVN (USD - US Dollar)',             countryCode: 'VN', currency: 'USD', balance: '12,450.00',         bankName: 'HSBC Bank (Vietnam) Ltd' },
  // Datamart Vietnam
  { id: 'dmxvn-vnd', number: '001-987654-001',        company: 'DATAMART VIET NAM CO., LTD',        countryLabel: 'Vietnam (Datamart) HBVN (VND - VIETNAMESE Dong)', countryCode: 'DMX_VN', currency: 'VND', balance: '1,920,450,000.00', bankName: 'HSBC Bank (Vietnam) Ltd' },
  { id: 'dmxvn-usd', number: '001-987654-002',        company: 'DATAMART VIET NAM CO., LTD',        countryLabel: 'Vietnam (Datamart) HBVN (USD - US Dollar)',       countryCode: 'DMX_VN', currency: 'USD', balance: '3,200.00',          bankName: 'HSBC Bank (Vietnam) Ltd' },
  // Singapore
  { id: 'sg-sgd',    number: '260-445872-001',        company: 'INTREPID DIGITAL COMMERCE PL',      countryLabel: 'Singapore HBSP (SGD - SINGAPORE Dollar)',    countryCode: 'SG', currency: 'SGD', balance: '85,640.50',         bankName: 'HSBC Bank (Singapore) Ltd' },
  { id: 'sg-usd',    number: '260-445872-002',        company: 'INTREPID DIGITAL COMMERCE PL',      countryLabel: 'Singapore HBSP (USD - US Dollar)',           countryCode: 'SG', currency: 'USD', balance: '9,150.00',          bankName: 'HSBC Bank (Singapore) Ltd' },
  // Indonesia
  { id: 'id-idr-1',  number: '050-300672-068',        company: 'INTREPID DIGITAL I PT',             countryLabel: 'Indonesia HBAP (IDR - INDONESIAN Rupiah)',   countryCode: 'ID', currency: 'IDR', balance: '3,128,250,856.00', bankName: 'PT Bank HSBC Indonesia' },
  { id: 'id-idr-2',  number: '050-300672-069',        company: 'INTREPID DIGITAL I PT',             countryLabel: 'Indonesia HBAP (IDR - INDONESIAN Rupiah)',   countryCode: 'ID', currency: 'IDR', balance: '1,363,989,810.00', bankName: 'PT Bank HSBC Indonesia' },
  { id: 'id-usd',    number: '050-300672-115',        company: 'INTREPID DIGITAL I PT',             countryLabel: 'Indonesia HBAP (USD - US Dollar)',           countryCode: 'ID', currency: 'USD', balance: '450.00',            bankName: 'PT Bank HSBC Indonesia' },
  // Malaysia
  { id: 'my-myr',    number: '352-663561-101',        company: 'INTREPID MALAYSIA SDN. BHD',        countryLabel: 'Malaysia HBMB (MYR - MALAYSIAN Ringgit)',    countryCode: 'MY', currency: 'MYR', balance: '260,515.35',       bankName: 'HSBC Bank Malaysia Berhad' },
  { id: 'my-usd',    number: '352-663561-725',        company: 'INTREPID MALAYSIA SDN. BHD',        countryLabel: 'Malaysia HBMB (USD - US Dollar)',            countryCode: 'MY', currency: 'USD', balance: '20.27',            bankName: 'HSBC Bank Malaysia Berhad' },
  // Philippines
  { id: 'ph-php-1',  number: '026-329243-040',        company: 'INTREPID PHILIPPINES INC.',         countryLabel: 'Philippines HBAP (PHP - PHILIPPINE Pesos)',  countryCode: 'PH', currency: 'PHP', balance: '5,281,100.75',    bankName: 'HSBC Philippines' },
  { id: 'ph-php-2',  number: '026-329243-041',        company: 'INTREPID PHILIPPINES INC.',         countryLabel: 'Philippines HBAP (PHP - PHILIPPINE Pesos)',  countryCode: 'PH', currency: 'PHP', balance: '43,812.29',        bankName: 'HSBC Philippines' },
];

// ── Transaction data (shared between account-detail page and export API) ──────

export type TxRow = {
  bankRef: string;
  narrative: string;
  customerRef: string | null;
  trnType: string;
  credit: number | null;
  debit: number | null;
  balance: number;
  postDate: string; // dd/mm/yyyy
};

// Mock data is relative to "today" (not a fixed calendar date) so a bank-sync job
// run any day still finds transactions inside its date range — a hardcoded date
// would silently go stale a few weeks after being written.
//
// getAccountTransactions() below recomputes these offsets from `new Date()` on every
// call (not once at module load) — otherwise the dates get baked in as literal strings
// the moment this module is first imported, and stay frozen at whatever "now" was at
// that instant until the process restarts. That made every restart re-anchor "today"
// to the restart's own timestamp, shifting the whole fixture set forward or back
// instead of each day's data staying put once that day arrives. Computing fresh per
// call keeps each offset (e.g. "0 days ago") tied to the real current calendar day,
// so a given fixture's date only ever advances by exactly one day per real day —
// restarting the server mid-day changes nothing.
export function daysAgoDMY(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function getAccountTransactions(): Record<string, TxRow[]> {
  return {
  '001-123456-001': [
    { bankRef: 'VND20260630001', narrative: 'SHOPEE VN PAYOUT SETTLEMENT',        customerRef: 'CUST-VN-630', trnType: 'RT PYMT', credit: 850000000, debit: null,        balance: 4850320000, postDate: daysAgoDMY(0) },
    { bankRef: 'VND20260629001', narrative: 'SUPPLIER PAYMENT MOCK JSC',          customerRef: null,          trnType: 'Transfer', credit: null,       debit: -320000000,   balance: 4000320000, postDate: daysAgoDMY(2) },
    { bankRef: 'VND20260629002', narrative: 'TIKTOK SHOP VN PAYOUT',              customerRef: 'CUST-VN-629', trnType: 'RT PYMT', credit: 410000000,  debit: null,        balance: 4320320000, postDate: daysAgoDMY(4) },
    { bankRef: 'VND20260628001', narrative: 'MARKETPLACE PAYOUT VIETNAM',         customerRef: 'CUST-VN-628', trnType: 'RT PYMT', credit: 3910320000, debit: null,        balance: 3910320000, postDate: daysAgoDMY(6) },
  ],
  '001-123456-002': [
    { bankRef: 'USD20260630030', narrative: 'USD WIRE TRANSFER IN',               customerRef: 'CUST-VNU-630', trnType: 'RT PYMT', credit:  500.00, debit: null,    balance: 12450.00, postDate: daysAgoDMY(0) },
    { bankRef: 'USD20260629030', narrative: 'USD CORRESPONDENT CHARGE',           customerRef: null,           trnType: 'Transfer', credit: null,    debit:   -25.00, balance: 11950.00, postDate: daysAgoDMY(3) },
    { bankRef: 'USD20260628030', narrative: 'USD INCOMING CROSS BORDER',          customerRef: 'CUST-VNU-628', trnType: 'RT PYMT', credit: 1200.00, debit: null,    balance: 11975.00, postDate: daysAgoDMY(6) },
  ],
  '001-987654-001': [
    { bankRef: 'VND20260630040', narrative: '/ORDP/DATAMART VN SUPPLIER/OBK/',    customerRef: '6306VND1A001', trnType: 'RT PYMT', credit: 320000000, debit: null,        balance: 1920450000, postDate: daysAgoDMY(0) },
    { bankRef: 'VND20260629040', narrative: 'STANDING INSTRUCTION INTERNAL',      customerRef: 'NONREF',       trnType: 'Transfer', credit: null,       debit: -150000000,   balance: 1600450000, postDate: daysAgoDMY(3) },
    { bankRef: 'VND20260628040', narrative: 'LAZADA VN PAYOUT SETTLEMENT',        customerRef: 'CUST-DMX-628', trnType: 'RT PYMT', credit: 1750450000, debit: null,        balance: 1750450000, postDate: daysAgoDMY(6) },
  ],
  '001-987654-002': [
    { bankRef: 'USD20260630041', narrative: 'USD TRANSFER DATAMART VN',           customerRef: 'CUST-DMXU-630', trnType: 'RT PYMT', credit:  300.00, debit: null,   balance: 3200.00, postDate: daysAgoDMY(0) },
    { bankRef: 'USD20260628041', narrative: 'USD BANK CHARGE',                    customerRef: null,            trnType: 'Transfer', credit: null,    debit:  -20.00, balance: 2900.00, postDate: daysAgoDMY(6) },
  ],
  '260-445872-001': [
    { bankRef: 'SGD20260630050', narrative: 'SHOPEE SG PAYOUT SETTLEMENT',        customerRef: 'CUST-SG-630', trnType: 'RT PYMT', credit: 32000.00, debit: null,     balance: 85640.50, postDate: daysAgoDMY(0) },
    { bankRef: 'SGD20260629050', narrative: 'SUPPLIER PAYMENT MOCK PTE LTD',      customerRef: null,          trnType: 'Transfer', credit: null,      debit: -12500.00, balance: 53640.50, postDate: daysAgoDMY(3) },
    { bankRef: 'SGD20260628050', narrative: 'MARKETPLACE PAYOUT SINGAPORE',       customerRef: 'CUST-SG-628', trnType: 'RT PYMT', credit: 66140.50, debit: null,      balance: 66140.50, postDate: daysAgoDMY(6) },
  ],
  '260-445872-002': [
    { bankRef: 'USD20260630051', narrative: 'USD SG INCOMING SWIFT',              customerRef: 'CUST-SGU-630', trnType: 'RT PYMT', credit: 150.00, debit: null,  balance: 9150.00, postDate: daysAgoDMY(0) },
    { bankRef: 'USD20260628051', narrative: 'USD SG BANK CHARGE',                 customerRef: null,           trnType: 'Transfer', credit: null,   debit: -15.00, balance: 9000.00, postDate: daysAgoDMY(6) },
  ],
  '050-300672-068': [
    { bankRef: 'IDR20260630001', narrative: '/ORDP/PT MOCK MITRA/OBK/970422/',    customerRef: '6306IDR1A001', trnType: 'RT PYMT', credit: 450000000, debit: null,        balance: 3128250856, postDate: daysAgoDMY(0) },
    { bankRef: 'IDR20260630002', narrative: 'STANDING INSTRUCTION INTERNAL',      customerRef: 'NONREF',       trnType: 'Transfer', credit: null,       debit: -1315106411,  balance: 2678250856, postDate: daysAgoDMY(1) },
    { bankRef: 'IDR20260629001', narrative: '/ORDP/PT MOCK DIGITAL/OBK/970422/',  customerRef: '6296IDR1B001', trnType: 'RT PYMT', credit: 299989200,  debit: null,        balance: 3993357267, postDate: daysAgoDMY(2) },
    { bankRef: 'IDR20260629002', narrative: '/ORDP/MBBANK IBFT MOCK TRANSFER/',   customerRef: '6296IDR1C001', trnType: 'RT PYMT', credit: 200000000,  debit: null,        balance: 3693368067, postDate: daysAgoDMY(4) },
    { bankRef: 'IDR20260628001', narrative: 'MARKETPLACE PAYOUT IDR LAZADA',      customerRef: 'CUST-ID-628',  trnType: 'RT PYMT', credit: 500000000,  debit: null,        balance: 3493368067, postDate: daysAgoDMY(5) },
    { bankRef: 'IDR20260628002', narrative: 'SUPPLIER PAYMENT IDR MOCK',          customerRef: null,           trnType: 'Transfer', credit: null,       debit: -150000000,   balance: 2993368067, postDate: daysAgoDMY(6) },
  ],
  '050-300672-069': [
    { bankRef: 'IDR20260630010', narrative: '/ORDP/PT MOCK ECOMM/OBK/970422/',   customerRef: '6306IDR2A001', trnType: 'RT PYMT', credit: 350000000,  debit: null,        balance: 1363989810, postDate: daysAgoDMY(0) },
    { bankRef: 'IDR20260629010', narrative: 'SHOPEE PAYOUT IDR SETTLEMENT',      customerRef: 'CUST-ID2-629', trnType: 'RT PYMT', credit: 180000000,  debit: null,        balance: 1013989810, postDate: daysAgoDMY(3) },
    { bankRef: 'IDR20260628010', narrative: 'TOKOPEDIA PAYOUT SETTLEMENT',       customerRef: 'CUST-ID2-628', trnType: 'RT PYMT', credit: 300000000,  debit: null,        balance:  833989810, postDate: daysAgoDMY(6) },
  ],
  '050-300672-115': [
    { bankRef: 'USD20260630010', narrative: 'USD TRANSFER INTREPID ID',          customerRef: 'CUST-IDU-630', trnType: 'RT PYMT', credit:  200.00, debit: null,   balance: 450.00, postDate: daysAgoDMY(0) },
    { bankRef: 'USD20260629010', narrative: 'USD WIRE CORRESPONDENT',            customerRef: null,           trnType: 'Transfer', credit: null,    debit: -50.00,  balance: 250.00, postDate: daysAgoDMY(3) },
    { bankRef: 'USD20260628010', narrative: 'USD INCOMING CROSS BORDER',         customerRef: 'CUST-IDU-628', trnType: 'RT PYMT', credit:  300.00, debit: null,   balance: 300.00, postDate: daysAgoDMY(6) },
  ],
  '352-663561-101': [
    { bankRef: 'MYR20260630001', narrative: 'SHOPEE MY PAYOUT SETTLEMENT',       customerRef: 'CUST-MY-630', trnType: 'RT PYMT', credit: 45000.00,  debit: null,     balance: 260515.35, postDate: daysAgoDMY(0) },
    { bankRef: 'MYR20260630002', narrative: 'LAZADA MY PAYOUT SETTLEMENT',       customerRef: 'CUST-MY-630', trnType: 'RT PYMT', credit: 28500.00,  debit: null,     balance: 215515.35, postDate: daysAgoDMY(2) },
    { bankRef: 'MYR20260629001', narrative: 'SUPPLIER PAYMENT MY MOCK SDN',      customerRef: null,          trnType: 'Transfer', credit: null,       debit: -12000.00, balance: 187015.35, postDate: daysAgoDMY(3) },
    { bankRef: 'MYR20260629002', narrative: 'TIKTOK MY PAYOUT SETTLEMENT',       customerRef: 'CUST-MY-629', trnType: 'RT PYMT', credit: 15800.00,  debit: null,     balance: 199015.35, postDate: daysAgoDMY(5) },
    { bankRef: 'MYR20260628001', narrative: 'MARKETPLACE PAYOUT MALAYSIA',       customerRef: 'CUST-MY-628', trnType: 'RT PYMT', credit: 183215.35, debit: null,     balance: 183215.35, postDate: daysAgoDMY(6) },
  ],
  '352-663561-725': [
    { bankRef: 'USD20260630020', narrative: 'USD MY INCOMING SWIFT',             customerRef: 'CUST-MYU-630', trnType: 'RT PYMT', credit: 10.00, debit: null,  balance: 20.27, postDate: daysAgoDMY(0) },
    { bankRef: 'USD20260628020', narrative: 'USD MY BANK CHARGE',                customerRef: null,           trnType: 'Transfer', credit: null,  debit:  -5.00, balance: 10.27, postDate: daysAgoDMY(6) },
  ],
  '026-329243-040': [
    { bankRef: 'PHP20260630001', narrative: 'SHOPEE PH PAYOUT SETTLEMENT',       customerRef: 'CUST-PH-630', trnType: 'RT PYMT', credit: 850000.00, debit: null,      balance: 5281100.75, postDate: daysAgoDMY(0) },
    { bankRef: 'PHP20260630002', narrative: 'LAZADA PH PAYOUT SETTLEMENT',       customerRef: 'CUST-PH-630', trnType: 'RT PYMT', credit: 420000.00, debit: null,      balance: 4431100.75, postDate: daysAgoDMY(2) },
    { bankRef: 'PHP20260629001', narrative: 'SUPPLIER PAYMENT PH MOCK INC',      customerRef: null,          trnType: 'Transfer', credit: null,       debit: -200000.00, balance: 4011100.75, postDate: daysAgoDMY(3) },
    { bankRef: 'PHP20260629002', narrative: 'TIKTOK PH PAYOUT SETTLEMENT',       customerRef: 'CUST-PH-629', trnType: 'RT PYMT', credit: 310000.00, debit: null,      balance: 4211100.75, postDate: daysAgoDMY(5) },
    { bankRef: 'PHP20260628001', narrative: 'MARKETPLACE INITIAL SETTLEMENT',    customerRef: 'CUST-PH-628', trnType: 'RT PYMT', credit: 3901100.75, debit: null,     balance: 3901100.75, postDate: daysAgoDMY(6) },
  ],
  '026-329243-041': [
    { bankRef: 'PHP20260630010', narrative: 'SHOPEE PH SUBSIDIARY PAYOUT',       customerRef: 'CUST-PH2-630', trnType: 'RT PYMT', credit: 25000.00, debit: null,     balance: 43812.29, postDate: daysAgoDMY(0) },
    { bankRef: 'PHP20260629010', narrative: 'PHP INCOMING TRANSFER PH2',         customerRef: 'CUST-PH2-629', trnType: 'RT PYMT', credit: 15000.00, debit: null,     balance: 18812.29, postDate: daysAgoDMY(3) },
    { bankRef: 'PHP20260628010', narrative: 'PHP INITIAL DEPOSIT SUBSIDIARY',    customerRef: 'CUST-PH2-628', trnType: 'RT PYMT', credit:  3812.29, debit: null,     balance:  3812.29, postDate: daysAgoDMY(6) },
    ],
  };
}

// Parse dd/mm/yyyy → Date (so we can compare)
export function parseDMY(s: string): Date {
  const [d, m, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d);
}

// ── PDF-export test support ─────────────────────────────────────────────────
// Real HSBCnet's per-row "..." action button embeds a customer reference + exact
// timestamp directly in its aria-label (confirmed via DevTools screenshot:
// `aria-label="Menu Thao tác, ... Mã tham chiếu khách hàng:INTREPID301097, at 28
// Aug 2026 10:49"`) — the worker's Playwright automation parses that string to
// match a table row back to its BankTransaction DB row, rather than reading
// several separate <td> cells. These two helpers let the mock page render the
// exact same shape so the automation can be tested end-to-end against it.

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** dd/mm/yyyy → "D MMM YYYY" (e.g. "28 Aug 2026") — matches HSBC's aria-label date format. */
export function formatAriaDate(postDateDMY: string): string {
  const d = parseDMY(postDateDMY);
  return `${d.getDate()} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

// No real "post time" field exists in the underlying data (HSBC's Excel export
// only has a date, not a time) — derive a stable HH:mm per row from its bank
// reference so the same transaction always renders the same time across reloads,
// without needing to add a new field to every literal row above.
export function timeForRow(bankRef: string): string {
  let hash = 0;
  for (let i = 0; i < bankRef.length; i++) hash = (hash * 31 + bankRef.charCodeAt(i)) >>> 0;
  const hh = String(7 + (hash % 11)).padStart(2, '0');   // 07..17
  // `>>` is a SIGNED 32-bit shift — hash can exceed 2^31-1 (it's >>> 0'd to unsigned
  // above), so `>>` on a large value wraps negative, and `% 60` on a negative number
  // stays negative in JS (produced "17:-58" instead of a real time). `>>>` keeps it
  // unsigned throughout.
  const mm = String((hash >>> 4) % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** The identifying reference shown in the row's action-button aria-label and used
 * by the worker to match this row back to a BankTransaction — customerRef when
 * present, else bankRef (mirrors how a real transaction can lack a customer ref). */
export function rowReference(t: Pick<TxRow, 'customerRef' | 'bankRef'>): string {
  return t.customerRef ?? t.bankRef;
}

// Group accounts by countryLabel for the accounts list page
export type AccountGroup = { label: string; accounts: MockAccount[] };
export function groupAccounts(): AccountGroup[] {
  const map = new Map<string, MockAccount[]>();
  for (const acc of MOCK_ACCOUNTS) {
    if (!map.has(acc.countryLabel)) map.set(acc.countryLabel, []);
    map.get(acc.countryLabel)!.push(acc);
  }
  return Array.from(map.entries()).map(([label, accounts]) => ({ label, accounts }));
}
