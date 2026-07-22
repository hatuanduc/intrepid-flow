'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyInviteToken, setPasswordWithToken } from '../../lib/api';
import { setToken } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import s from './SetPasswordPage.module.css';

type State = 'loading' | 'valid' | 'invalid' | 'expired' | 'done';

export default function SetPasswordPage() {
  const router = useRouter();
  const { t } = useT();
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
    if (!name.trim()) errs.name = t('setPassword.nameRequired');
    if (!password) errs.password = t('setPassword.passwordRequired');
    else if (password.length < 6) errs.password = t('setPassword.passwordTooShort');
    if (!confirm) errs.confirm = t('setPassword.confirmRequired');
    else if (password && confirm !== password) errs.confirm = t('setPassword.confirmMismatch');
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
      const res = await setPasswordWithToken(token, password, name.trim());
      if (res.token) {
        // Auto-login: user vừa kích hoạt vào thẳng app, không bounce qua trang login
        setToken(res.token);
        router.replace('/');
        return;
      }
      setState('done');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setApiError(code === 'INVITE_EXPIRED' ? t('setPassword.expiredError') : t('setPassword.genericError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logo}>Intrepid Flow</div>

        {state === 'loading' && (
          <p className={s.message}>{t('setPassword.verifying')}</p>
        )}

        {state === 'invalid' && (
          <>
            <h1 className={s.title}>{t('setPassword.invalidTitle')}</h1>
            <p className={s.desc}>{t('setPassword.invalidDesc')}</p>
          </>
        )}

        {state === 'expired' && (
          <>
            <h1 className={s.title}>{t('setPassword.expiredTitle')}</h1>
            <p className={s.desc}>{t('setPassword.expiredDesc')}</p>
          </>
        )}

        {state === 'done' && (
          <>
            <div className={s.successIcon}>✓</div>
            <h1 className={s.title}>{t('setPassword.doneTitle')}</h1>
            <p className={s.desc}>{t('setPassword.doneDesc')}</p>
            <button className={s.btnPrimary} onClick={() => router.push('/login')}>
              {t('setPassword.goToLogin')}
            </button>
          </>
        )}

        {state === 'valid' && (
          <>
            <h1 className={s.title}>{t('setPassword.title')}</h1>
            <p className={s.desc}>{t('setPassword.accountLabel')} <strong>{userEmail}</strong></p>

            <form onSubmit={handleSubmit} className={s.form}>
              <div className={s.field}>
                <label className={s.label}>{t('setPassword.nameLabel')}</label>
                <input
                  className={`${s.input} ${errors.name ? s.inputError : ''}`}
                  value={name}
                  onChange={e => { setName(e.target.value); if (errors.name) setErrors(p => { const n = {...p}; delete n.name; return n; }); }}
                  placeholder={t('setPassword.namePlaceholder')}
                  autoFocus
                />
                {errors.name && <span className={s.fieldError}>{errors.name}</span>}
              </div>
              <div className={s.field}>
                <label className={s.label}>{t('setPassword.passwordLabel')}</label>
                <input
                  type="password"
                  className={`${s.input} ${errors.password ? s.inputError : ''}`}
                  value={password}
                  onChange={e => { setPassword(e.target.value); if (errors.password) setErrors(p => { const n = {...p}; delete n.password; return n; }); }}
                  placeholder={t('setPassword.passwordPlaceholder')}
                  autoComplete="new-password"
                />
                {errors.password && <span className={s.fieldError}>{errors.password}</span>}
              </div>
              <div className={s.field}>
                <label className={s.label}>{t('setPassword.confirmLabel')}</label>
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
                {saving ? t('setPassword.saving') : t('setPassword.submit')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
