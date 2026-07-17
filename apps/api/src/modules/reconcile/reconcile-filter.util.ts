import type { CellValue } from 'exceljs';

// Vietnamese diacritics can be stored as either one precomposed Unicode codepoint or as a base
// letter + separate combining accent marks (NFC vs NFD) — they render identically in Excel but
// compare as different strings in JS. Files from different exporters (or column names typed vs
// pasted into Settings) can end up on different sides of that split, so every header/column-name
// comparison in this module must go through this same normalization on both sides.
export function normalizeHeaderKey(text: string): string {
  return text.trim().normalize('NFC').toLowerCase();
}

export function buildHeaderIndex(headerValues: CellValue[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 1; i < headerValues.length; i++) {
    const v = headerValues[i];
    const text = cellToString(v).trim();
    if (text) map.set(normalizeHeaderKey(text), i); // keep last occurrence, like the old headerDict
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

export function sanitizeOutputFileName(name: string): string {
  let base = (name || '').trim();
  base = base.replace(/[\\/]/g, '_').replace(/\.\./g, '_');
  // eslint-disable-next-line no-control-regex
  base = base.replace(/[<>:"|?*\x00-\x1F]/g, '_');
  if (!base) base = 'service_invoices_merged.xlsx';
  if (!/\.xlsx$/i.test(base)) base += '.xlsx';
  return base;
}
