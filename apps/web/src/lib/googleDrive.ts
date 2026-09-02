// Google Drive folder ID helpers — accept either a bare ID or a full folder URL.
// Mirrors googleSheets.ts's extractSpreadsheetId/isValidSpreadsheetId exactly.

const DRIVE_FOLDER_URL_RE = /\/drive\/folders\/([a-zA-Z0-9_-]+)/;
const DRIVE_FOLDER_ID_RE = /^[a-zA-Z0-9_-]{20,80}$/;

export function extractFolderId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(DRIVE_FOLDER_URL_RE);
  return match ? match[1] : trimmed;
}

export function isValidFolderId(id: string): boolean {
  return DRIVE_FOLDER_ID_RE.test(id);
}
