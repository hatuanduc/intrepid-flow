'use client';

import BrandLogo from '../../components/BrandLogo';
import Link from 'next/link';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { googleLogin, login } from '../../lib/api';
import { getToken, setToken } from '../../lib/auth';
import { useT } from '../../lib/i18n';

import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();
  const { t, lang } = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // '' khi chưa/không cấu hình — đọc trong effect để tránh hydration mismatch
  const [googleClientId, setGoogleClientId] = useState('');
  const [gisFailed, setGisFailed] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  function clearField(field: string) {
    setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  }

  useEffect(() => {
    const token = getToken();
    if (token) router.replace('/');
    Promise.resolve().then(() => setGoogleClientId(window.__INTREPID__?.googleClientId ?? ''));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doLogin() {
    const errs: Record<string, string> = {};
    if (!username.trim()) errs.username = t('login.usernameRequired');
    if (!password) errs.password = t('login.passwordRequired');
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setError(null);
    setLoading(true);
    try {
      const result = await login(username.trim(), password);
      setToken(result.token);
      router.replace('/');
    } catch {
      setError(t('login.invalidCredentials'));
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') void doLogin();
  }

  async function handleGoogleCredential(credential: string) {
    setError(null);
    setLoading(true);
    try {
      const result = await googleLogin(credential);
      setToken(result.token);
      router.replace('/');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(
        code === 'GOOGLE_NOT_INVITED' ? t('login.googleNotInvited')
        : code === 'USER_INACTIVE' ? t('login.googleInactive')
        : t('login.googleFailed'),
      );
      setLoading(false);
    }
  }

  function initGoogle() {
    const clientId = window.__INTREPID__?.googleClientId;
    if (!clientId || !window.google || !googleBtnRef.current) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (res) => void handleGoogleCredential(res.credential),
      auto_select: false, // button-only — không dùng One Tap prompt
    });
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      width: 320,
      locale: lang === 'vi' ? 'vi' : 'en',
    });
  }

  return (
    <main className={styles.page}>
      <div className={styles.bg}>
        <div className={styles.r5} />
        <div className={styles.r1} />
        <div className={styles.r2} />
        <div className={styles.r3} />
        <div className={styles.r4} />
      </div>

      <header className={styles.header}>
        <BrandLogo height={36} />
      </header>

      <div className={styles.cardWrap}>
        <div className={styles.card}>
          <h1 className={styles.title}>{t('login.title')}</h1>

          {/* Loading overlay */}
          {loading && (
            <div className={styles.loadingOverlay}>
              <div className={styles.loadingSpinner} />
              <span>{t('login.loggingIn')}</span>
            </div>
          )}

          {/* Dùng div thay form để tránh native form submission */}
          <div className={styles.form}>
            <div className={styles.field}>
              <span className={styles.label}>{t('login.username')}</span>
              <input
                className={`${styles.input} ${fieldErrors.username ? styles.inputError : ''}`}
                value={username}
                onChange={e => { setUsername(e.target.value); clearField('username'); setError(null); }}
                onKeyDown={handleKeyDown}
                type="text"
                autoComplete="username"
                autoFocus
                disabled={loading}
              />
              {fieldErrors.username && <span className={styles.fieldError}>{fieldErrors.username}</span>}
            </div>

            <div className={styles.field}>
              <span className={styles.label}>{t('login.password')}</span>
              <div className={styles.passwordWrap}>
                <input
                  className={`${styles.input} ${fieldErrors.password ? styles.inputError : ''}`}
                  value={password}
                  onChange={e => { setPassword(e.target.value); clearField('password'); setError(null); }}
                  onKeyDown={handleKeyDown}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  disabled={loading}
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              {fieldErrors.password && <span className={styles.fieldError}>{fieldErrors.password}</span>}
              <Link href="/forgot-password" className={styles.forgotLink}>{t('login.forgotPasswordLink')}</Link>
            </div>

            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}

            <button
              className={styles.button}
              type="button"
              disabled={loading}
              onClick={() => void doLogin()}
            >
              {t('login.submit')}
            </button>

            {googleClientId && !gisFailed && (
              <>
                <div className={styles.divider}><span>{t('login.orDivider')}</span></div>
                <div ref={googleBtnRef} className={styles.googleWrap} />
                <Script
                  src="https://accounts.google.com/gsi/client"
                  strategy="afterInteractive"
                  onReady={initGoogle}
                  onError={() => setGisFailed(true)}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
