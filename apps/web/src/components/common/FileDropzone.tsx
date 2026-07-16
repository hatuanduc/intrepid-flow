'use client';

import { useRef } from 'react';
import s from './FileDropzone.module.css';

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FileIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M1.5 6.5h13M5.5 2.5v11M10.5 2.5v11" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
  </svg>
);

const UploadIcon = (
  <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
    <path d="M8 11V2M8 2L5 5M8 2l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2.5 11v2a1 1 0 001 1h9a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export function Dropzone({
  hint, sub, onFiles, active, setActive, multiple = true,
}: {
  hint: string;
  sub: string;
  onFiles: (files: FileList) => void;
  active: boolean;
  setActive: (v: boolean) => void;
  multiple?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={[s.dropzone, active ? s.dropzoneActive : ''].join(' ')}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setActive(true); }}
      onDragLeave={() => setActive(false)}
      onDrop={e => {
        e.preventDefault();
        setActive(false);
        if (e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
      }}
    >
      <div className={s.dropzoneIcon}>{UploadIcon}</div>
      <p className={s.dropzoneHint}>{hint}</p>
      <p className={s.dropzoneSub}>{sub}</p>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept=".xlsx,.xls"
        className={s.hiddenInput}
        onChange={e => { if (e.target.files) onFiles(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}

export function FileListRow({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <div className={s.fileRow}>
      <span className={s.fileIcon}>{FileIcon}</span>
      <span className={s.fileInfo}>
        <span className={s.fileName}>{file.name}</span>
        <span className={s.fileSize}>{formatFileSize(file.size)}</span>
      </span>
      <button type="button" className={s.fileRemoveBtn} onClick={onRemove} aria-label="Remove">✕</button>
    </div>
  );
}
