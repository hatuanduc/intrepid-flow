'use client';
import { useState } from 'react';
import { useUser } from '../../app/(dashboard)/user-context';
import { useToast } from '../../components/common/Toast';
import { updateMyProfile, changeMyPassword } from '../../lib/api';
import { useT } from '../../lib/i18n';
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
  const { t, lang, setLang } = useT();

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
    if (!name.trim()) { setNameError(t('account.nameRequired')); return; }
    setNameError('');
    setSavingProfile(true);
    try {
      await updateMyProfile(name.trim());
      setDisplayName(name.trim());
      setEditing(false);
      toast.success(t('account.profileUpdated'));
    } catch {
      toast.error(t('account.profileUpdateFailed'));
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
    if (!currentPw) errs.currentPw = t('account.currentPasswordRequired');
    if (!newPw) errs.newPw = t('account.newPasswordRequired');
    else if (newPw.length < 6) errs.newPw = t('account.newPasswordMinLength');
    if (!confirmPw) errs.confirmPw = t('account.confirmPasswordRequired');
    else if (newPw && confirmPw !== newPw) errs.confirmPw = t('account.passwordMismatch');
    if (Object.keys(errs).length > 0) { setPwErrors(errs); return; }
    setPwErrors({});
    setSavingPw(true);
    try {
      await changeMyPassword(currentPw, newPw);
      toast.success(t('account.passwordChanged'));
      setPwPanelOpen(false);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setPwErrors({ currentPw: code === 'INVALID_PASSWORD' ? t('account.currentPasswordWrong') : t('account.passwordChangeFailed') });
    } finally {
      setSavingPw(false);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>{t('account.title')}</h1>
      </div>

      <div className={s.card}>
        {/* Card header */}
        <div className={s.cardHead}>
          <span className={s.cardTitle}>{t('account.personalInfo')}</span>
          {!editing ? (
            <button className={s.btnEdit} onClick={startEdit}>
              <EditIcon /> {t('account.edit')}
            </button>
          ) : (
            <div className={s.editActions}>
              <button className={s.btnCancel} type="button" onClick={cancelEdit} disabled={savingProfile}>{t('account.cancel')}</button>
              <button className={s.btnSave} form="profile-form" type="submit" disabled={savingProfile}>
                {savingProfile ? t('account.saving') : t('account.saveChanges')}
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
            <span className={s.infoLabel}>{t('account.displayName')}</span>
            {editing ? (
              <div className={s.infoInput}>
                <input
                  className={`${s.input} ${nameError ? s.inputError : ''}`}
                  value={name}
                  onChange={e => { setName(e.target.value); setNameError(''); }}
                  placeholder={t('account.displayNamePlaceholder')}
                  autoFocus
                />
                {nameError && <span className={s.fieldError}>{nameError}</span>}
              </div>
            ) : (
              <span className={s.infoValue}>{displayName || <span className={s.infoEmpty}>{t('account.noName')}</span>}</span>
            )}
          </div>

          <div className={s.infoRow}>
            <span className={s.infoLabel}>{t('account.email')}</span>
            <span className={s.infoValue}>{user.email}</span>
          </div>

          <div className={s.infoRow}>
            <span className={s.infoLabel}>{t('account.password')}</span>
            <div className={s.pwRow}>
              <span className={s.pwDots}>••••••••</span>
              <button type="button" className={s.btnChangePw} onClick={openPwPanel}>{t('account.changePassword')}</button>
            </div>
          </div>

          <div className={`${s.infoRow} ${s.infoRowLast}`}>
            <span className={s.infoLabel}>{t('account.roles')}</span>
            <div className={s.roleList}>
              {user.roles.length > 0
                ? user.roles.map(r => <RoleBadge key={r} name={r} />)
                : <span className={s.infoEmpty}>{t('account.noRoles')}</span>}
            </div>
          </div>
        </form>
      </div>

      {/* Language card */}
      <div className={`${s.card} ${s.cardGap}`}>
        <div className={s.cardHead}>
          <span className={s.cardTitle}>{t('account.language')}</span>
        </div>
        <div className={`${s.infoRow} ${s.infoRowLast}`}>
          <span className={s.infoLabel}>{t('account.language')}</span>
          <div className={s.langOptions}>
            <button
              className={`${s.langBtn} ${lang === 'en' ? s.langBtnActive : ''}`}
              onClick={() => setLang('en')}
            >
              English
            </button>
            <button
              className={`${s.langBtn} ${lang === 'vi' ? s.langBtnActive : ''}`}
              onClick={() => setLang('vi')}
            >
              Tiếng Việt
            </button>
          </div>
        </div>
      </div>

      {/* Change password panel */}
      <RightPanel
        title={t('account.pwPanel')}
        open={pwPanelOpen}
        onClose={() => setPwPanelOpen(false)}
        width={400}
        footer={<>
          <button className={s.btnCancel} onClick={() => setPwPanelOpen(false)}>{t('account.cancel')}</button>
          <button className={s.btnSave} form="pw-form" type="submit" disabled={savingPw}>
            {savingPw ? t('account.saving') : t('account.changePassword')}
          </button>
        </>}
      >
        <form id="pw-form" onSubmit={handleChangePassword} className={s.form}>
          <div className={s.field}>
            <label className={s.label}>{t('account.currentPassword')}</label>
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
            <label className={s.label}>{t('account.newPassword')}</label>
            <input
              type="password"
              className={`${s.input} ${pwErrors.newPw ? s.inputError : ''}`}
              value={newPw}
              onChange={e => { setNewPw(e.target.value); clearPwField('newPw'); }}
              placeholder={t('account.newPasswordPlaceholder')}
              autoComplete="new-password"
            />
            {pwErrors.newPw && <span className={s.fieldError}>{pwErrors.newPw}</span>}
          </div>
          <div className={s.field}>
            <label className={s.label}>{t('account.confirmPassword')}</label>
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
