'use client';

import { useEffect, useRef, useState } from 'react';
import {
  listGasLinks, deleteGasLink as apiDeleteGasLink,
  type GasLink,
} from '../../lib/api';
import { useHasPermission } from '../../hooks/useHasPermission';
import { useToast } from '../../components/common/Toast';
import { useT } from '../../lib/i18n';
import { Spinner } from '../../components/common/PageLoader';
import AccessDenied from '../../components/common/AccessDenied';
import GasLinkPanel from './GasLinkPanel';
import GasLinkFrameModal from './GasLinkFrameModal';
import s from './GasLinksPage.module.css';

function MoreMenu({ onEdit, onDelete }: { onEdit?: () => void; onDelete?: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!onEdit && !onDelete) return null;

  return (
    <div className={`${s.moreWrap} ${open ? s.moreWrapOpen : ''}`} ref={ref} onClick={e => e.stopPropagation()}>
      <button className={`${s.moreBtn} ${open ? s.moreBtnOpen : ''}`} onClick={() => setOpen(v => !v)}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="2" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="12" cy="7" r="1.2" fill="currentColor"/>
        </svg>
      </button>
      {open && (
        <div className={s.moreDropdown}>
          {onEdit && <button className={s.moreItem} onClick={() => { setOpen(false); onEdit(); }}>{t('common.edit')}</button>}
          {onDelete && <button className={`${s.moreItem} ${s.moreItemDanger}`} onClick={() => { setOpen(false); onDelete(); }}>{t('common.delete')}</button>}
        </div>
      )}
    </div>
  );
}

function ConfirmDeleteModal({
  link, deleting, error, onConfirm, onCancel,
}: {
  link: GasLink; deleting: boolean; error: string | null; onConfirm: () => void; onCancel: () => void;
}) {
  const { t } = useT();
  return (
    <div className={s.modalOverlay} onClick={onCancel}>
      <div className={s.modal} onClick={e => e.stopPropagation()}>
        <p className={s.modalTitle}>{t('gasLinks.confirmDeleteTitle')}</p>
        <p className={s.modalDesc}>{t('gasLinks.confirmDeleteDesc', { name: link.name })}</p>
        {error && <div className={s.modalError}>{error}</div>}
        <div className={s.modalActions}>
          <button className={s.btnSecondary} onClick={onCancel} disabled={deleting}>{t('common.cancel')}</button>
          <button className={s.btnDanger} onClick={onConfirm} disabled={deleting}>
            {deleting ? t('common.deleting') : t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GasLinksPage() {
  const canView = useHasPermission('gas_links:view');
  const canCreate = useHasPermission('gas_links:create');
  const canEdit = useHasPermission('gas_links:edit');
  const canDelete = useHasPermission('gas_links:delete');
  const toast = useToast();
  const { t } = useT();

  const [links, setLinks] = useState<GasLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelTarget, setPanelTarget] = useState<GasLink | 'new' | null>(null);
  const [frameTarget, setFrameTarget] = useState<GasLink | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GasLink | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await listGasLinks();
      setLinks(r.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load());
  }, []);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiDeleteGasLink(deleteTarget.id);
      toast.success(t('gasLinks.deleteSuccess'));
      setDeleteTarget(null);
      load();
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setDeleteError(code === 'GAS_LINK_NOT_FOUND' ? t('gasLinks.notFound') : t('gasLinks.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  }

  if (!canView) return <AccessDenied />;

  return (
    <div className={s.page}>
      <div className={s.pageHeader}>
        <h1 className={s.pageTitle}>{t('gasLinks.pageTitle')}</h1>
        {canCreate && (
          <button className={s.btnPrimary} onClick={() => setPanelTarget('new')}>{t('gasLinks.addNew')}</button>
        )}
      </div>

      {loading ? (
        <div className={s.empty}><Spinner size={20} /></div>
      ) : links.length === 0 ? (
        <div className={s.emptyState}>
          <p className={s.emptyTitle}>{t('gasLinks.empty')}</p>
          <p className={s.emptyDesc}>{t('gasLinks.emptyDesc')}</p>
        </div>
      ) : (
        <div className={s.grid}>
          {links.map(link => (
            <div key={link.id} className={s.card} onClick={() => setFrameTarget(link)}>
              <div className={s.cardTop}>
                <span className={s.iconWrap}>{link.icon}</span>
                <MoreMenu
                  onEdit={canEdit ? () => setPanelTarget(link) : undefined}
                  onDelete={canDelete ? () => setDeleteTarget(link) : undefined}
                />
              </div>
              <h3 className={s.cardTitle}>{link.name}</h3>
              {link.description && <p className={s.cardDesc}>{link.description}</p>}
              <div className={s.cardFooter}>
                {t('gasLinks.createdBy', { name: link.createdBy?.name ?? link.createdBy?.email ?? '—' })}
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDeleteModal
          link={deleteTarget}
          deleting={deleting}
          error={deleteError}
          onConfirm={handleConfirmDelete}
          onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
        />
      )}

      <GasLinkPanel
        target={panelTarget}
        open={panelTarget !== null}
        onClose={() => setPanelTarget(null)}
        onSaved={() => { setPanelTarget(null); load(); }}
      />

      <GasLinkFrameModal link={frameTarget} onClose={() => setFrameTarget(null)} />
    </div>
  );
}
