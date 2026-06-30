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
