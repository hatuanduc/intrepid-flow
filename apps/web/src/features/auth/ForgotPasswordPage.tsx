'use client';
import { useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '../../lib/api';
import { useT } from '../../lib/i18n';
import s from './SetPasswordPage.module.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [sentEmail, setSentEmail] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) { setFieldError(t('forgotPassword.emailRequired')); return; }
    if (!EMAIL_RE.test(trimmed)) { setFieldError(t('forgotPassword.emailInvalid')); return; }
    setFieldError('');
    setSending(true);
    try {
      await forgotPassword(trimmed);
      setSentEmail(trimmed);
      setDone(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logo}>Intrepid Flow</div>

        {done ? (
          <>
            <div className={s.successIcon}>✓</div>
            <h1 className={s.title}>{t('forgotPassword.doneTitle')}</h1>
            <p className={s.desc}>{t('forgotPassword.doneDesc', { email: sentEmail })}</p>
            <Link href="/login" className={`${s.btnPrimary} ${s.linkBtn}`}>
              {t('forgotPassword.backToLogin')}
            </Link>
          </>
        ) : (
          <>
            <h1 className={s.title}>{t('forgotPassword.title')}</h1>
            <p className={s.desc}>{t('forgotPassword.desc')}</p>

            <form onSubmit={handleSubmit} className={s.form}>
              <div className={s.field}>
                <label className={s.label}>{t('forgotPassword.emailLabel')}</label>
                <input
                  className={`${s.input} ${fieldError ? s.inputError : ''}`}
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setFieldError(''); }}
                  placeholder={t('forgotPassword.emailPlaceholder')}
                  autoFocus
                  autoComplete="email"
                />
                {fieldError && <span className={s.fieldError}>{fieldError}</span>}
              </div>
              <button type="submit" className={s.btnPrimary} disabled={sending}>
                {sending ? t('forgotPassword.sending') : t('forgotPassword.submit')}
              </button>
            </form>
            <Link href="/login" className={s.backLink}>{t('forgotPassword.backToLogin')}</Link>
          </>
        )}
      </div>
    </div>
  );
}
