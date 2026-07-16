import type { CellValue } from 'exceljs';

export type RowType = 'RETAIL' | 'SERVICE' | 'OTHER';

// CellValue as it crosses a JSON-based IPC boundary (parent <-> invoice-file-worker child
// process) — Dates lose their type over JSON, so they're wrapped and revived explicitly.
export type SerializedCellValue = CellValue | { __type: 'date'; value: string };

export function serializeCellValue(v: CellValue): SerializedCellValue {
  if (v instanceof Date) return { __type: 'date', value: v.toISOString() };
  return v;
}

export function deserializeCellValue(v: SerializedCellValue): CellValue {
  if (v !== null && typeof v === 'object' && (v as { __type?: string }).__type === 'date') {
    return new Date((v as { value: string }).value);
  }
  return v as CellValue;
}

export function buildHeaderIndex(headerValues: CellValue[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 1; i < headerValues.length; i++) {
    const v = headerValues[i];
    const text = cellToString(v).trim();
    if (text) map.set(text.toLowerCase(), i); // keep last occurrence, like the old headerDict
  }
  return map;
}

export function cellToString(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const obj = value as unknown as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text: string }>).map(t => t.text).join('');
    }
    if (typeof obj.text === 'string') return obj.text;
    if ('result' in obj) return cellToString(obj.result as CellValue);
    return '';
  }
  return String(value);
}

export function cellToNumber(value: CellValue): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'object' && !(value instanceof Date)) {
    const obj = value as unknown as Record<string, unknown>;
    if ('result' in obj) return cellToNumber(obj.result as CellValue);
    return 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// Verbatim port of GetBrandNameFromNote (macro-powertool/BusinessFilter.bas:681).
// noteVal is split on "_"; VBA's `Like "Retail_*"` treats "_" as a literal character,
// not a wildcard, so this is a plain string split — not a SQL-LIKE single-char match.
export function extractBrandFromNote(noteVal: string, rowIndex: number): string {
  const parts = noteVal.split('_');
  const ub = parts.length - 1;
  if (ub >= 4) return `${parts[2].trim()}_${parts[3].trim()}`.toUpperCase();
  if (ub >= 3) return parts[2].trim().toUpperCase();
  return `UNDEFINED-${rowIndex}`;
}

export function sanitizeOutputFileName(name: string): string {
  let base = (name || '').trim();
  base = base.replace(/[\\/]/g, '_').replace(/\.\./g, '_');
  // eslint-disable-next-line no-control-regex
  base = base.replace(/[<>:"|?*\x00-\x1F]/g, '_');
  if (!base) base = 'service_invoices_merged.xlsx';
  if (!/\.xlsx$/i.test(base)) base += '.xlsx';
  return base;
}
