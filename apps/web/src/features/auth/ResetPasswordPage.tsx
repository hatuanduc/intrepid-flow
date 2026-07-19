'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { verifyResetToken, resetPasswordWithToken } from '../../lib/api';
import { useT } from '../../lib/i18n';
import s from './SetPasswordPage.module.css';

type State = 'loading' | 'valid' | 'invalid' | 'expired' | 'done';

export default function ResetPasswordPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { t } = useT();

  const [state, setState] = useState<State>(() => token ? 'loading' : 'invalid');
  const [userEmail, setUserEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (!token) return;
    verifyResetToken(token)
      .then(res => { setUserEmail(res.email); setState('valid'); })
      .catch(err => {
        const code = err instanceof Error ? err.message : '';
        setState(code === 'RESET_EXPIRED' ? 'expired' : 'invalid');
      });
  }, [token]);

  function validate() {
    const errs: Record<string, string> = {};
    if (!password) errs.password = t('resetPassword.passwordRequired');
    else if (password.length < 6) errs.password = t('resetPassword.passwordMinLength');
    if (!confirm) errs.confirm = t('resetPassword.confirmRequired');
    else if (password && confirm !== password) errs.confirm = t('resetPassword.passwordMismatch');
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
      await resetPasswordWithToken(token, password);
      setState('done');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setApiError(code === 'RESET_EXPIRED' ? t('resetPassword.expiredDesc') : t('resetPassword.genericError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logo}>Intrepid Flow</div>

        {state === 'loading' && (
          <p className={s.message}>{t('resetPassword.verifying')}</p>
        )}

        {state === 'invalid' && (
          <>
            <h1 className={s.title}>{t('resetPassword.invalidTitle')}</h1>
            <p className={s.desc}>{t('resetPassword.invalidDesc')}</p>
            <Link href="/forgot-password" className={`${s.btnPrimary} ${s.linkBtn}`}>
              {t('resetPassword.requestNew')}
            </Link>
          </>
        )}

        {state === 'expired' && (
          <>
            <h1 className={s.title}>{t('resetPassword.expiredTitle')}</h1>
            <p className={s.desc}>{t('resetPassword.expiredDesc')}</p>
            <Link href="/forgot-password" className={`${s.btnPrimary} ${s.linkBtn}`}>
              {t('resetPassword.requestNew')}
            </Link>
          </>
        )}

        {state === 'done' && (
          <>
            <div className={s.successIcon}>✓</div>
            <h1 className={s.title}>{t('resetPassword.doneTitle')}</h1>
            <p className={s.desc}>{t('resetPassword.doneDesc')}</p>
            <button className={s.btnPrimary} onClick={() => router.push('/login')}>
              {t('resetPassword.goToLogin')}
            </button>
          </>
        )}

        {state === 'valid' && (
          <>
            <h1 className={s.title}>{t('resetPassword.title')}</h1>
            <p className={s.desc}>{t('resetPassword.accountLabel')}: <strong>{userEmail}</strong></p>

            <form onSubmit={handleSubmit} className={s.form}>
              <div className={s.field}>
                <label className={s.label}>{t('resetPassword.newPasswordLabel')}</label>
                <input
                  type="password"
                  className={`${s.input} ${errors.password ? s.inputError : ''}`}
                  value={password}
                  onChange={e => { setPassword(e.target.value); if (errors.password) setErrors(p => { const n = {...p}; delete n.password; return n; }); }}
                  placeholder={t('resetPassword.newPasswordPlaceholder')}
                  autoComplete="new-password"
                  autoFocus
                />
                {errors.password && <span className={s.fieldError}>{errors.password}</span>}
              </div>
              <div className={s.field}>
                <label className={s.label}>{t('resetPassword.confirmPasswordLabel')}</label>
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
                {saving ? t('resetPassword.saving') : t('resetPassword.submit')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
