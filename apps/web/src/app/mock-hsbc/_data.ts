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

export const ACCOUNT_TRANSACTIONS: Record<string, TxRow[]> = {
  '001-123456-001': [
    { bankRef: 'VND20260630001', narrative: 'SHOPEE VN PAYOUT SETTLEMENT',        customerRef: 'CUST-VN-630', trnType: 'RT PYMT', credit: 850000000, debit: null,        balance: 4850320000, postDate: '30/06/2026' },
    { bankRef: 'VND20260629001', narrative: 'SUPPLIER PAYMENT MOCK JSC',          customerRef: null,          trnType: 'Transfer', credit: null,       debit: 320000000,   balance: 4000320000, postDate: '29/06/2026' },
    { bankRef: 'VND20260629002', narrative: 'TIKTOK SHOP VN PAYOUT',              customerRef: 'CUST-VN-629', trnType: 'RT PYMT', credit: 410000000,  debit: null,        balance: 4320320000, postDate: '29/06/2026' },
    { bankRef: 'VND20260628001', narrative: 'MARKETPLACE PAYOUT VIETNAM',         customerRef: 'CUST-VN-628', trnType: 'RT PYMT', credit: 3910320000, debit: null,        balance: 3910320000, postDate: '28/06/2026' },
  ],
  '001-123456-002': [
    { bankRef: 'USD20260630030', narrative: 'USD WIRE TRANSFER IN',               customerRef: 'CUST-VNU-630', trnType: 'RT PYMT', credit:  500.00, debit: null,    balance: 12450.00, postDate: '30/06/2026' },
    { bankRef: 'USD20260629030', narrative: 'USD CORRESPONDENT CHARGE',           customerRef: null,           trnType: 'Transfer', credit: null,    debit:   25.00, balance: 11950.00, postDate: '29/06/2026' },
    { bankRef: 'USD20260628030', narrative: 'USD INCOMING CROSS BORDER',          customerRef: 'CUST-VNU-628', trnType: 'RT PYMT', credit: 1200.00, debit: null,    balance: 11975.00, postDate: '28/06/2026' },
  ],
  '001-987654-001': [
    { bankRef: 'VND20260630040', narrative: '/ORDP/DATAMART VN SUPPLIER/OBK/',    customerRef: '6306VND1A001', trnType: 'RT PYMT', credit: 320000000, debit: null,        balance: 1920450000, postDate: '30/06/2026' },
    { bankRef: 'VND20260629040', narrative: 'STANDING INSTRUCTION INTERNAL',      customerRef: 'NONREF',       trnType: 'Transfer', credit: null,       debit: 150000000,   balance: 1600450000, postDate: '29/06/2026' },
    { bankRef: 'VND20260628040', narrative: 'LAZADA VN PAYOUT SETTLEMENT',        customerRef: 'CUST-DMX-628', trnType: 'RT PYMT', credit: 1750450000, debit: null,        balance: 1750450000, postDate: '28/06/2026' },
  ],
  '001-987654-002': [
    { bankRef: 'USD20260630041', narrative: 'USD TRANSFER DATAMART VN',           customerRef: 'CUST-DMXU-630', trnType: 'RT PYMT', credit:  300.00, debit: null,   balance: 3200.00, postDate: '30/06/2026' },
    { bankRef: 'USD20260628041', narrative: 'USD BANK CHARGE',                    customerRef: null,            trnType: 'Transfer', credit: null,    debit:  20.00, balance: 2900.00, postDate: '28/06/2026' },
  ],
  '260-445872-001': [
    { bankRef: 'SGD20260630050', narrative: 'SHOPEE SG PAYOUT SETTLEMENT',        customerRef: 'CUST-SG-630', trnType: 'RT PYMT', credit: 32000.00, debit: null,     balance: 85640.50, postDate: '30/06/2026' },
    { bankRef: 'SGD20260629050', narrative: 'SUPPLIER PAYMENT MOCK PTE LTD',      customerRef: null,          trnType: 'Transfer', credit: null,      debit: 12500.00, balance: 53640.50, postDate: '29/06/2026' },
    { bankRef: 'SGD20260628050', narrative: 'MARKETPLACE PAYOUT SINGAPORE',       customerRef: 'CUST-SG-628', trnType: 'RT PYMT', credit: 66140.50, debit: null,      balance: 66140.50, postDate: '28/06/2026' },
  ],
  '260-445872-002': [
    { bankRef: 'USD20260630051', narrative: 'USD SG INCOMING SWIFT',              customerRef: 'CUST-SGU-630', trnType: 'RT PYMT', credit: 150.00, debit: null,  balance: 9150.00, postDate: '30/06/2026' },
    { bankRef: 'USD20260628051', narrative: 'USD SG BANK CHARGE',                 customerRef: null,           trnType: 'Transfer', credit: null,   debit: 15.00, balance: 9000.00, postDate: '28/06/2026' },
  ],
  '050-300672-068': [
    { bankRef: 'IDR20260630001', narrative: '/ORDP/PT MOCK MITRA/OBK/970422/',    customerRef: '6306IDR1A001', trnType: 'RT PYMT', credit: 450000000, debit: null,        balance: 3128250856, postDate: '30/06/2026' },
    { bankRef: 'IDR20260630002', narrative: 'STANDING INSTRUCTION INTERNAL',      customerRef: 'NONREF',       trnType: 'Transfer', credit: null,       debit: 1315106411,  balance: 2678250856, postDate: '30/06/2026' },
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

// Parse dd/mm/yyyy → Date (so we can compare)
export function parseDMY(s: string): Date {
  const [d, m, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d);
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
