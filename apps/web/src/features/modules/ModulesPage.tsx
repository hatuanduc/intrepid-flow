'use client';

import { useEffect, useState } from 'react';
import { listWorkflowModules, updateWorkflowModule, type WorkflowModuleItem } from '../../lib/api';
import s from './ModulesPage.module.css';

function ModuleIcon({ moduleKey }: { moduleKey: string }) {
  if (moduleKey === 'bank_statement') {
    return (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="4" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M1 7h14" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M4 10.5h2M10 10.5h2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        <path d="M5 1.5L8 4l3-2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (moduleKey === 'gmail_invoice') {
    return (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
        <path d="M1 4.5l7 5 7-5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="9" y="5" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <rect x="1" y="10" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5 2.5h2.5a1 1 0 011 1V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M5 11.5h2.5a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export default function ModulesPage() {
  const [modules, setModules] = useState<WorkflowModuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    listWorkflowModules()
      .then(res => setModules(res.items))
      .finally(() => setLoading(false));
  }, []);

  async function handleToggle(mod: WorkflowModuleItem) {
    setToggling(mod.key);
    try {
      const res = await updateWorkflowModule(mod.key, { isEnabled: !mod.isEnabled });
      setModules(prev => prev.map(m => m.key === mod.key ? res.item : m));
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <h1 className={s.title}>Quy trình tự động</h1>
        <p className={s.subtitle}>Bật hoặc tắt các quy trình tự động hóa trong hệ thống.</p>
      </div>

      {loading ? (
        <div className={s.empty}>Đang tải...</div>
      ) : modules.length === 0 ? (
        <div className={s.empty}>Chưa có quy trình nào.</div>
      ) : (
        <div className={s.grid}>
          {modules.map(mod => (
            <div key={mod.key} className={[s.card, mod.isEnabled ? s.cardEnabled : ''].filter(Boolean).join(' ')}>
              <div className={s.cardTop}>
                <span className={[s.iconWrap, mod.isEnabled ? s.iconEnabled : ''].filter(Boolean).join(' ')}>
                  <ModuleIcon moduleKey={mod.key} />
                </span>
                <span className={mod.isEnabled ? s.badgeOn : s.badgeOff}>
                  {mod.isEnabled ? 'Đang bật' : 'Tắt'}
                </span>
              </div>
              <h3 className={s.cardTitle}>{mod.name}</h3>
              {mod.description && <p className={s.cardDesc}>{mod.description}</p>}
              <div className={s.cardFooter}>
                <button
                  className={mod.isEnabled ? s.btnDisable : s.btnEnable}
                  onClick={() => handleToggle(mod)}
                  disabled={toggling === mod.key}
                >
                  {toggling === mod.key ? '...' : mod.isEnabled ? 'Tắt quy trình' : 'Bật quy trình'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
