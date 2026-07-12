// Google Sheets ID helpers — accept either a bare ID or a full sheet URL.

const SPREADSHEET_URL_RE = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;
const SPREADSHEET_ID_RE = /^[a-zA-Z0-9_-]{20,80}$/;

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(SPREADSHEET_URL_RE);
  return match ? match[1] : trimmed;
}

export function isValidSpreadsheetId(id: string): boolean {
  return SPREADSHEET_ID_RE.test(id);
}
