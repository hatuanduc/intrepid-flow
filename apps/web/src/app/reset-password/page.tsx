import { Suspense } from 'react';
import ResetPasswordPage from '../../features/auth/ResetPasswordPage';
export const metadata = { title: 'Đặt lại mật khẩu' };
export default function Page() {
  return <Suspense><ResetPasswordPage /></Suspense>;
}
