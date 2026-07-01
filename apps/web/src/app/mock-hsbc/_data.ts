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
  // Hong Kong
  { id: 'hk-sa-eur', number: '652-138066-838/SA-EUR', company: 'INTREPID E-COMMERCE HONG KONG LTD', countryLabel: 'Hong Kong SAR HBAP (EUR - Euro)',          countryCode: 'HK', currency: 'EUR', balance: '1.08',             bankName: 'Hongkong Shanghai Banking Corp Ltd' },
  { id: 'hk-cu-hkd', number: '652-138066-838/CU-HKD', company: 'INTREPID E-COMMERCE HONG KONG LTD', countryLabel: 'Hong Kong SAR HBAP (HKD - HONG KONG Dollar)', countryCode: 'HK', currency: 'HKD', balance: '0.00',             bankName: 'Hongkong Shanghai Banking Corp Ltd' },
  { id: 'hk-sa-hkd', number: '652-138066-838/SA-HKD', company: 'INTREPID E-COMMERCE HONG KONG LTD', countryLabel: 'Hong Kong SAR HBAP (HKD - HONG KONG Dollar)', countryCode: 'HK', currency: 'HKD', balance: '14,434.06',        bankName: 'Hongkong Shanghai Banking Corp Ltd' },
  { id: 'hk-sa-usd', number: '652-138066-838/SA-USD', company: 'INTREPID E-COMMERCE HONG KONG LTD', countryLabel: 'Hong Kong SAR HBAP (USD - US Dollar)',        countryCode: 'HK', currency: 'USD', balance: '35.71',            bankName: 'Hongkong Shanghai Banking Corp Ltd' },
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
  '652-138066-838/SA-EUR': [
    { bankRef: 'EUR20260630001', narrative: 'INTREPID HK EUR INCOMING SWIFT',    customerRef: 'CUST-HK-630', trnType: 'RT PYMT', credit: 1500.00, debit: null,    balance: 1501.08,  postDate: '30/06/2026' },
    { bankRef: 'EUR20260629001', narrative: 'INTREPID HK EUR TRANSFER IN',        customerRef: 'CUST-HK-629', trnType: 'RT PYMT', credit: 320.50,  debit: null,    balance:    1.08,  postDate: '29/06/2026' },
    { bankRef: 'EUR20260629002', narrative: 'HSBC EUR SERVICE CHARGE',            customerRef: null,          trnType: 'Transfer', credit: null,    debit: 45.00,   balance: -319.42,  postDate: '29/06/2026' },
    { bankRef: 'EUR20260628001', narrative: 'INTREPID HK EUR PAYMENT RECEIVED',   customerRef: 'CUST-HK-628', trnType: 'RT PYMT', credit: 800.00,  debit: null,    balance:  800.00,  postDate: '28/06/2026' },
  ],
  '652-138066-838/CU-HKD': [
    { bankRef: 'HKD20260630001', narrative: 'HKD INTERNAL TRANSFER',              customerRef: null,          trnType: 'Transfer', credit: null,    debit: 100.00,  balance:    0.00,  postDate: '30/06/2026' },
    { bankRef: 'HKD20260629001', narrative: 'HKD COLLECTION',                     customerRef: 'CUST-CU-629', trnType: 'RT PYMT', credit: 100.00,  debit: null,    balance:  100.00,  postDate: '29/06/2026' },
  ],
  '652-138066-838/SA-HKD': [
    { bankRef: 'HKD20260630010', narrative: 'ECOMM SETTLEMENT HK SA-HKD',         customerRef: 'CUST-SH-630', trnType: 'RT PYMT', credit: 5200.00, debit: null,    balance: 14434.06, postDate: '30/06/2026' },
    { bankRef: 'HKD20260630011', narrative: 'SUPPLIER PAYMENT MOCK CO LTD',       customerRef: null,          trnType: 'Transfer', credit: null,    debit: 1800.00, balance:  9234.06, postDate: '30/06/2026' },
    { bankRef: 'HKD20260629010', narrative: 'PLATFORM FEE SETTLEMENT',            customerRef: 'CUST-SH-629', trnType: 'RT PYMT', credit: 3400.00, debit: null,    balance: 11034.06, postDate: '29/06/2026' },
    { bankRef: 'HKD20260629011', narrative: 'LOGISTICS CHARGE MOCK EXPRESS',      customerRef: null,          trnType: 'Transfer', credit: null,    debit:  560.00, balance:  7634.06, postDate: '29/06/2026' },
    { bankRef: 'HKD20260628010', narrative: 'MARKETPLACE PAYOUT HK',              customerRef: 'CUST-SH-628', trnType: 'RT PYMT', credit: 8194.06, debit: null,    balance:  8194.06, postDate: '28/06/2026' },
  ],
  '652-138066-838/SA-USD': [
    { bankRef: 'USD20260630001', narrative: 'USD WIRE TRANSFER IN',               customerRef: 'CUST-US-630', trnType: 'RT PYMT', credit:   50.00, debit: null,    balance:   35.71,  postDate: '30/06/2026' },
    { bankRef: 'USD20260629001', narrative: 'USD CORRESPONDENT CHARGE',           customerRef: null,          trnType: 'Transfer', credit: null,    debit:   14.29, balance:  -14.29,  postDate: '29/06/2026' },
    { bankRef: 'USD20260628001', narrative: 'USD INCOMING PAYMENT',               customerRef: 'CUST-US-628', trnType: 'RT PYMT', credit:  500.00, debit: null,    balance:  500.00,  postDate: '28/06/2026' },
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
