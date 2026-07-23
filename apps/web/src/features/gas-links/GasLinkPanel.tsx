'use client';

import { useEffect, useRef, useState } from 'react';
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react';
import { createGasLink, updateGasLink, type GasLink } from '../../lib/api';
import RightPanel from '../../components/common/RightPanel';
import { useToast } from '../../components/common/Toast';
import { useT } from '../../lib/i18n';
import s from './GasLinkPanel.module.css';

const DEFAULT_ICON = '🔗';

type Props = {
  target: GasLink | 'new' | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function GasLinkPanel({ target, open, onClose, onSaved }: Props) {
  const toast = useToast();
  const { t } = useT();
  const isEdit = target !== null && target !== 'new';

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  useEffect(() => {
    if (!open) return;
    Promise.resolve().then(() => {
      if (isEdit && target) {
        setName(target.name);
        setUrl(target.url);
        setDescription(target.description ?? '');
        setIcon(target.icon);
      } else {
        setName(''); setUrl(''); setDescription(''); setIcon('');
      }
      setError(null);
      setFieldErrors({});
    });
  }, [open, target, isEdit]);

  function clearField(field: string) {
    setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t('gasLinks.nameRequired');
    if (!url.trim()) errs.url = t('gasLinks.urlRequired');
    else {
      try { new URL(url.trim()); } catch { errs.url = t('gasLinks.urlInvalid'); }
    }
    return errs;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setError(null);
    setSaving(true);
    try {
      const body = { name: name.trim(), url: url.trim(), icon: icon.trim() || DEFAULT_ICON, description: description.trim() || undefined };
      if (isEdit && target) await updateGasLink(target.id, body);
      else await createGasLink(body);
      toast.success(isEdit ? t('gasLinks.updateSuccess') : t('gasLinks.createSuccess'));
      onSaved();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(code === 'GAS_LINK_NOT_FOUND' ? t('gasLinks.notFound') : t('gasLinks.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <>
      <button type="button" className={s.btnSecondary} onClick={onClose}>{t('gasLinks.cancel')}</button>
      <button type="submit" form="gas-link-form" className={s.btnPrimary} disabled={saving}>
        {saving ? t('gasLinks.saving') : t('gasLinks.save')}
      </button>
    </>
  );

  return (
    <RightPanel
      title={isEdit ? t('gasLinks.editPanelTitle') : t('gasLinks.createPanelTitle')}
      open={open}
      onClose={onClose}
      footer={footer}
    >
      <form id="gas-link-form" onSubmit={submit} className={s.form}>
        <div className={s.field}>
          <label className={s.label}>{t('gasLinks.iconLabel')}</label>
          <div className={s.iconTriggerWrap} ref={pickerRef}>
            <button
              type="button"
              className={s.iconTrigger}
              onClick={() => setPickerOpen(v => !v)}
            >
              {icon || DEFAULT_ICON}
            </button>
            <button type="button" className={s.iconTriggerLabel} onClick={() => setPickerOpen(v => !v)}>
              {t('gasLinks.changeIcon')}
            </button>
            {pickerOpen && (
              <div className={s.emojiPickerWrap}>
                <EmojiPicker
                  onEmojiClick={data => { setIcon(data.emoji); setPickerOpen(false); }}
                  emojiStyle={EmojiStyle.NATIVE}
                  skinTonesDisabled
                  previewConfig={{ showPreview: false }}
                  lazyLoadEmojis
                  autoFocusSearch
                  width={320}
                  height={360}
                />
              </div>
            )}
          </div>
        </div>

        <div className={s.field}>
          <label className={s.label}>{t('gasLinks.nameLabel')}</label>
          <input
            className={`${s.input} ${fieldErrors.name ? s.inputError : ''}`}
            value={name}
            onChange={e => { setName(e.target.value); clearField('name'); }}
            placeholder={t('gasLinks.namePlaceholder')}
            autoFocus
          />
          {fieldErrors.name && <span className={s.fieldError}>{fieldErrors.name}</span>}
        </div>

        <div className={s.field}>
          <label className={s.label}>{t('gasLinks.urlLabel')}</label>
          <input
            className={`${s.input} ${fieldErrors.url ? s.inputError : ''}`}
            value={url}
            onChange={e => { setUrl(e.target.value); clearField('url'); }}
            placeholder={t('gasLinks.urlPlaceholder')}
          />
          {fieldErrors.url && <span className={s.fieldError}>{fieldErrors.url}</span>}
        </div>

        <div className={s.field}>
          <label className={s.label}>{t('gasLinks.descLabel')}</label>
          <textarea
            className={s.textarea}
            value={description}
            onChange={e => setDescription(e.target.value.slice(0, 200))}
            placeholder={t('gasLinks.descPlaceholder')}
            rows={3}
            maxLength={200}
          />
          <span className={s.charCount}>{description.length}/200</span>
        </div>

        {error && <div className={s.error}>{error}</div>}
      </form>
    </RightPanel>
  );
}
