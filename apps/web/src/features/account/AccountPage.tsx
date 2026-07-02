'use client';
import { useState } from 'react';
import { useUser } from '../../app/(dashboard)/user-context';
import { useToast } from '../../components/common/Toast';
import { updateMyProfile, changeMyPassword } from '../../lib/api';
import RightPanel from '../../components/common/RightPanel';
import s from './AccountPage.module.css';

const AVATAR_COLORS = ['#635bff', '#09825d', '#1a56db', '#7c3aed', '#c44c0a', '#0e7490', '#92400e', '#be185d'];
function avatarColor(str: string) { return AVATAR_COLORS[str.charCodeAt(0) % AVATAR_COLORS.length]; }

function RoleBadge({ name }: { name: string }) {
  const lower = name.toLowerCase();
  const cls = lower.includes('admin') || lower.includes('quản trị') ? s.roleAdmin
    : lower.includes('owner') || lower.includes('chủ') ? s.roleOwner
    : lower.includes('editor') || lower.includes('biên') ? s.roleEditor
    : s.roleViewer;
  return <span className={`${s.roleBadge} ${cls}`}>{name}</span>;
}

function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M8.5 1.5a1.414 1.414 0 012 2L3.5 10.5l-3 .5.5-3L8.5 1.5z"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function AccountPage() {
  const user = useUser();
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [displayName, setDisplayName] = useState(user?.name ?? '');
  const [nameError, setNameError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwPanelOpen, setPwPanelOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [savingPw, setSavingPw] = useState(false);

  if (!user) return null;

  const avatarSrc = displayName || user.email;
  const initials = avatarSrc[0].toUpperCase();

  function startEdit() { setName(displayName); setNameError(''); setEditing(true); }
  function cancelEdit() { setEditing(false); setNameError(''); }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setNameError('Vui lòng nhập tên.'); return; }
    setNameError('');
    setSavingProfile(true);
    try {
      await updateMyProfile(name.trim());
      setDisplayName(name.trim());
      setEditing(false);
      toast.success('Đã cập nhật tên thành công.');
    } catch {
      toast.error('Cập nhật thất bại. Vui lòng thử lại.');
    } finally {
      setSavingProfile(false);
    }
  }

  function openPwPanel() {
    setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwErrors({});
    setPwPanelOpen(true);
  }

  function clearPwField(field: string) {
    setPwErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!currentPw) errs.currentPw = 'Vui lòng nhập mật khẩu hiện tại.';
    if (!newPw) errs.newPw = 'Vui lòng nhập mật khẩu mới.';
    else if (newPw.length < 6) errs.newPw = 'Mật khẩu tối thiểu 6 ký tự.';
    if (!confirmPw) errs.confirmPw = 'Vui lòng xác nhận mật khẩu.';
    else if (newPw && confirmPw !== newPw) errs.confirmPw = 'Mật khẩu xác nhận không khớp.';
    if (Object.keys(errs).length > 0) { setPwErrors(errs); return; }
    setPwErrors({});
    setSavingPw(true);
    try {
      await changeMyPassword(currentPw, newPw);
      toast.success('Đã đổi mật khẩu thành công.');
      setPwPanelOpen(false);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setPwErrors({ currentPw: code === 'INVALID_PASSWORD' ? 'Mật khẩu hiện tại không đúng.' : 'Đổi mật khẩu thất bại.' });
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>Tài khoản</h1>
      </div>

      <div className={s.card}>
        {/* Card header */}
        <div className={s.cardHead}>
          <span className={s.cardTitle}>Thông tin cá nhân</span>
          {!editing ? (
            <button className={s.btnEdit} onClick={startEdit}>
              <EditIcon /> Chỉnh sửa
            </button>
          ) : (
            <div className={s.editActions}>
              <button className={s.btnCancel} type="button" onClick={cancelEdit} disabled={savingProfile}>Hủy</button>
              <button className={s.btnSave} form="profile-form" type="submit" disabled={savingProfile}>
                {savingProfile ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          )}
        </div>

        {/* Avatar overview */}
        <div className={s.profileTop}>
          <span className={s.avatar} style={{ background: avatarColor(avatarSrc) }}>{initials}</span>
          <div className={s.profileInfo}>
            <span className={s.profileName}>{displayName || user.email}</span>
            <span className={s.profileEmail}>{user.email}</span>
          </div>
        </div>

        <div className={s.divider} />

        {/* Info rows */}
        <form id="profile-form" onSubmit={handleSaveProfile}>
          <div className={s.infoRow}>
            <span className={s.infoLabel}>Tên hiển thị</span>
            {editing ? (
              <div className={s.infoInput}>
                <input
                  className={`${s.input} ${nameError ? s.inputError : ''}`}
                  value={name}
                  onChange={e => { setName(e.target.value); setNameError(''); }}
                  placeholder="Nhập tên của bạn"
                  autoFocus
                />
                {nameError && <span className={s.fieldError}>{nameError}</span>}
              </div>
            ) : (
              <span className={s.infoValue}>{displayName || <span className={s.infoEmpty}>Chưa đặt tên</span>}</span>
            )}
          </div>

          <div className={s.infoRow}>
            <span className={s.infoLabel}>Email</span>
            <span className={s.infoValue}>{user.email}</span>
          </div>

          <div className={s.infoRow}>
            <span className={s.infoLabel}>Mật khẩu</span>
            <div className={s.pwRow}>
              <span className={s.pwDots}>••••••••</span>
              <button type="button" className={s.btnChangePw} onClick={openPwPanel}>Đổi mật khẩu</button>
            </div>
          </div>

          <div className={`${s.infoRow} ${s.infoRowLast}`}>
            <span className={s.infoLabel}>Vai trò</span>
            <div className={s.roleList}>
              {user.roles.length > 0
                ? user.roles.map(r => <RoleBadge key={r} name={r} />)
                : <span className={s.infoEmpty}>Chưa có vai trò</span>}
            </div>
          </div>
        </form>
      </div>

      {/* Change password panel */}
      <RightPanel
        title="Đổi mật khẩu"
        open={pwPanelOpen}
        onClose={() => setPwPanelOpen(false)}
        width={400}
        footer={<>
          <button className={s.btnCancel} onClick={() => setPwPanelOpen(false)}>Hủy</button>
          <button className={s.btnSave} form="pw-form" type="submit" disabled={savingPw}>
            {savingPw ? 'Đang lưu...' : 'Đổi mật khẩu'}
          </button>
        </>}
      >
        <form id="pw-form" onSubmit={handleChangePassword} className={s.form}>
          <div className={s.field}>
            <label className={s.label}>Mật khẩu hiện tại</label>
            <input
              type="password"
              className={`${s.input} ${pwErrors.currentPw ? s.inputError : ''}`}
              value={currentPw}
              onChange={e => { setCurrentPw(e.target.value); clearPwField('currentPw'); }}
              autoComplete="current-password"
              autoFocus
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
      </RightPanel>
    </div>
  );
}
