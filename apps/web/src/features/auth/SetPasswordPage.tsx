'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyInviteToken, setPasswordWithToken } from '../../lib/api';
import s from './SetPasswordPage.module.css';

type State = 'loading' | 'valid' | 'invalid' | 'expired' | 'done';

export default function SetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [state, setState] = useState<State>(() => token ? 'loading' : 'invalid');
  const [userEmail, setUserEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (!token) return;
    verifyInviteToken(token)
      .then(res => { setUserEmail(res.email); setState('valid'); })
      .catch(err => {
        const code = err instanceof Error ? err.message : '';
        setState(code === 'INVITE_EXPIRED' ? 'expired' : 'invalid');
      });
  }, [token]);

  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Vui lòng nhập tên hiển thị.';
    if (!password) errs.password = 'Vui lòng nhập mật khẩu.';
    else if (password.length < 6) errs.password = 'Mật khẩu tối thiểu 6 ký tự.';
    if (!confirm) errs.confirm = 'Vui lòng xác nhận mật khẩu.';
    else if (password && confirm !== password) errs.confirm = 'Mật khẩu xác nhận không khớp.';
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setErrors({});
    setApiError('');
    setSaving(true);
    try {
      await setPasswordWithToken(token, password, name.trim());
      setState('done');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setApiError(code === 'INVITE_EXPIRED' ? 'Link đã hết hạn. Liên hệ admin để gửi lại.' : 'Thiết lập thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logo}>Intrepid Flow</div>

        {state === 'loading' && (
          <p className={s.message}>Đang xác thực link...</p>
        )}

        {state === 'invalid' && (
          <>
            <h1 className={s.title}>Link không hợp lệ</h1>
            <p className={s.desc}>Link mời này không tồn tại hoặc đã được sử dụng.</p>
          </>
        )}

        {state === 'expired' && (
          <>
            <h1 className={s.title}>Link đã hết hạn</h1>
            <p className={s.desc}>Link mời đã hết hạn sau 7 ngày. Liên hệ admin để gửi lại lời mời.</p>
          </>
        )}

        {state === 'done' && (
          <>
            <div className={s.successIcon}>✓</div>
            <h1 className={s.title}>Mật khẩu đã được thiết lập!</h1>
            <p className={s.desc}>Tài khoản của bạn đã sẵn sàng. Đăng nhập ngay để bắt đầu.</p>
            <button className={s.btnPrimary} onClick={() => router.push('/login')}>
              Đến trang đăng nhập
            </button>
          </>
        )}

        {state === 'valid' && (
          <>
            <h1 className={s.title}>Thiết lập mật khẩu</h1>
            <p className={s.desc}>Tài khoản: <strong>{userEmail}</strong></p>

            <form onSubmit={handleSubmit} className={s.form}>
              <div className={s.field}>
                <label className={s.label}>Tên hiển thị</label>
                <input
                  className={`${s.input} ${errors.name ? s.inputError : ''}`}
                  value={name}
                  onChange={e => { setName(e.target.value); if (errors.name) setErrors(p => { const n = {...p}; delete n.name; return n; }); }}
                  placeholder="Họ và tên của bạn"
                  autoFocus
                />
                {errors.name && <span className={s.fieldError}>{errors.name}</span>}
              </div>
              <div className={s.field}>
                <label className={s.label}>Mật khẩu mới</label>
                <input
                  type="password"
                  className={`${s.input} ${errors.password ? s.inputError : ''}`}
                  value={password}
                  onChange={e => { setPassword(e.target.value); if (errors.password) setErrors(p => { const n = {...p}; delete n.password; return n; }); }}
                  placeholder="Tối thiểu 6 ký tự"
                  autoComplete="new-password"
                />
                {errors.password && <span className={s.fieldError}>{errors.password}</span>}
              </div>
              <div className={s.field}>
                <label className={s.label}>Xác nhận mật khẩu</label>
                <input
                  type="password"
                  className={`${s.input} ${errors.confirm ? s.inputError : ''}`}
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); if (errors.confirm) setErrors(p => { const n = {...p}; delete n.confirm; return n; }); }}
                  autoComplete="new-password"
                />
                {errors.confirm && <span className={s.fieldError}>{errors.confirm}</span>}
              </div>
              {apiError && <div className={s.error}>{apiError}</div>}
              <button type="submit" className={s.btnPrimary} disabled={saving}>
                {saving ? 'Đang lưu...' : 'Thiết lập mật khẩu'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
