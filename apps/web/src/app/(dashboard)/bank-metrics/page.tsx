import { Suspense } from 'react';
import BankMetricsPage from '../../../features/bank-statement/BankMetricsPage';

export const metadata = { title: 'Bank Metrics' };

export default function Page() {
  return (
    <Suspense>
      <BankMetricsPage />
    </Suspense>
  );
}
