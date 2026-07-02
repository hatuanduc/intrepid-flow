import { Suspense } from 'react';
import SetPasswordPage from '../../features/auth/SetPasswordPage';
export const metadata = { title: 'Thiết lập mật khẩu' };
export default function Page() {
  return <Suspense><SetPasswordPage /></Suspense>;
}
