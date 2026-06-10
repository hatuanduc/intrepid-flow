'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { login } from '../../lib/api';
import { getToken, setToken } from '../../lib/auth';
import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (token) router.replace('/');
  }, [router]);

  const canSubmit = useMemo(() => {
    return username.trim().length > 0 && password.trim().length > 0 && !loading;
  }, [username, password, loading]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(username.trim(), password);
      setToken(result.token);
      router.replace('/');
    } catch (err) {
      setError('Tên đăng nhập hoặc mật khẩu không đúng.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      {/* Background ribbons */}
      <div className={styles.bg}>
        <div className={styles.r1} />
        <div className={styles.r2} />
        <div className={styles.r3} />
        <div className={styles.r4} />
      </div>

      {/* Page-level header — brand outside card */}
      <header className={styles.header}>
        <span className={styles.brand}>intrepid</span>
      </header>

      {/* Centered card */}
      <div className={styles.cardWrap}>
        <div className={styles.card}>
          <h1 className={styles.title}>Đăng nhập</h1>
          <p className={styles.subtitle}>Chào mừng trở lại. Vui lòng nhập thông tin.</p>

          <form className={styles.form} onSubmit={onSubmit}>
            <label className={styles.field}>
              <span className={styles.label}>Tên đăng nhập</span>
              <input
                className={styles.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                type="text"
                autoComplete="username"
                autoFocus
                required
              />
            </label>

            <div className={styles.field}>
              <span className={styles.label}>Mật khẩu</span>
              <div className={styles.passwordWrap}>
                <input
                  className={styles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
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
            </div>

            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}

            <button className={styles.button} type="submit" disabled={!canSubmit}>
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

