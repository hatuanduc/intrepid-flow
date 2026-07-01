'use client';
import { useState } from 'react';
import { useUser } from '../../app/(dashboard)/user-context';
import { useToast } from '../../components/common/Toast';
import { updateMyProfile, changeMyPassword } from '../../lib/api';
import s from './AccountPage.module.css';

const AVATAR_COLORS = ['#635bff', '#09825d', '#1a56db', '#7c3aed', '#c44c0a', '#0e7490', '#92400e', '#be185d'];
function avatarColor(str: string) { return AVATAR_COLORS[str.charCodeAt(0) % AVATAR_COLORS.length]; }

export default function AccountPage() {
  const user = useUser();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [savingPw, setSavingPw] = useState(false);

  if (!user) return null;

  const avatarSrc = user.name || user.email;
  const initials = avatarSrc[0].toUpperCase();

  function clearPwField(field: string) {
    setPwErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setNameError('Vui lòng nhập tên.'); return; }
    setNameError('');
    setSavingProfile(true);
    try {
      await updateMyProfile(name.trim());
      toast.success('Đã cập nhật tên. Tải lại trang để thấy thay đổi.');
    } catch {
      toast.error('Cập nhật thất bại. Vui lòng thử lại.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!currentPw) errs.currentPw = 'Vui lòng nhập mật khẩu hiện tại.';
    if (!newPw) errs.newPw = 'Vui lòng nhập mật khẩu mới.';
    else if (newPw.length < 6) errs.newPw = 'Mật khẩu tối thiểu 6 ký tự.';
    if (!confirmPw) errs.confirmPw = 'Vui lòng xác nhận mật khẩu mới.';
    else if (newPw && confirmPw !== newPw) errs.confirmPw = 'Mật khẩu xác nhận không khớp.';
    if (Object.keys(errs).length > 0) { setPwErrors(errs); return; }
    setPwErrors({});
    setSavingPw(true);
    try {
      await changeMyPassword(currentPw, newPw);
      toast.success('Đã đổi mật khẩu thành công.');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      toast.error(code === 'INVALID_PASSWORD' ? 'Mật khẩu hiện tại không đúng.' : 'Đổi mật khẩu thất bại. Vui lòng thử lại.');
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>Tài khoản</h1>
        <p className={s.pageMeta}>Quản lý thông tin cá nhân và bảo mật</p>
      </div>

      {/* Profile card */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <h2 className={s.cardTitle}>Hồ sơ</h2>
        </div>
        <div className={s.cardBody}>
          <div className={s.profileTop}>
            <span className={s.avatar} style={{ background: avatarColor(avatarSrc) }}>{initials}</span>
            <div className={s.profileInfo}>
              <span className={s.profileName}>{user.name ?? user.email}</span>
              <span className={s.profileEmail}>{user.email}</span>
              {user.roles.length > 0 && (
                <div className={s.profileRoles}>
                  {user.roles.map(r => <span key={r} className={s.roleBadge}>{r}</span>)}
                </div>
              )}
            </div>
          </div>

          <div className={s.divider} />

          <form id="profile-form" onSubmit={handleSaveProfile} className={s.form}>
            <div className={s.field}>
              <label className={s.label}>Tên hiển thị</label>
              <input
                className={`${s.input} ${nameError ? s.inputError : ''}`}
                value={name}
                onChange={e => { setName(e.target.value); setNameError(''); }}
                placeholder="Nhập tên của bạn"
              />
              {nameError && <span className={s.fieldError}>{nameError}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>Email</label>
              <input className={`${s.input} ${s.inputReadonly}`} value={user.email} readOnly />
            </div>
          </form>

          <div className={s.formFooter}>
            <button className={s.btnPrimary} form="profile-form" type="submit" disabled={savingProfile}>
              {savingProfile ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>

      {/* Password card */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <h2 className={s.cardTitle}>Bảo mật</h2>
        </div>
        <div className={s.cardBody}>
          <form id="pw-form" onSubmit={handleChangePassword} className={s.form}>
            <div className={s.field}>
              <label className={s.label}>Mật khẩu hiện tại</label>
              <input
                type="password"
                className={`${s.input} ${pwErrors.currentPw ? s.inputError : ''}`}
                value={currentPw}
                onChange={e => { setCurrentPw(e.target.value); clearPwField('currentPw'); }}
                autoComplete="current-password"
              />
              {pwErrors.currentPw && <span className={s.fieldError}>{pwErrors.currentPw}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>Mật khẩu mới</label>
              <input
                type="password"
                className={`${s.input} ${pwErrors.newPw ? s.inputError : ''}`}
                value={newPw}
                onChange={e => { setNewPw(e.target.value); clearPwField('newPw'); }}
                placeholder="Tối thiểu 6 ký tự"
                autoComplete="new-password"
              />
              {pwErrors.newPw && <span className={s.fieldError}>{pwErrors.newPw}</span>}
            </div>
            <div className={s.field}>
              <label className={s.label}>Xác nhận mật khẩu mới</label>
              <input
                type="password"
                className={`${s.input} ${pwErrors.confirmPw ? s.inputError : ''}`}
                value={confirmPw}
                onChange={e => { setConfirmPw(e.target.value); clearPwField('confirmPw'); }}
                autoComplete="new-password"
              />
              {pwErrors.confirmPw && <span className={s.fieldError}>{pwErrors.confirmPw}</span>}
            </div>
          </form>

          <div className={s.formFooter}>
            <button className={s.btnPrimary} form="pw-form" type="submit" disabled={savingPw}>
              {savingPw ? 'Đang đổi...' : 'Đổi mật khẩu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
