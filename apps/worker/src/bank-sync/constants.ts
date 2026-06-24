export const BANK_SYNC_QUEUE = 'bank-sync';

export const JOB_STATUS = {
  PENDING: 'pending',
  CHECKING_SESSION: 'checking_session',
  LOGGING_IN: 'logging_in',
  WAITING_2FA: 'waiting_2fa',
  AUTHENTICATED: 'authenticated',
  DOWNLOADING: 'downloading',
  STORING: 'storing',
  SYNCING_SHEETS: 'syncing_sheets',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

export const FAIL_REASON = {
  TIMEOUT_2FA: 'timeout_2fa',
  SESSION_ERROR: 'session_error',
  DOWNLOAD_ERROR: 'download_error',
  PARSE_ERROR: 'parse_error',
  MISSING_REQUIRED_COLUMNS: 'missing_required_columns',
  SHEET_ERROR: 'sheet_error',
} as const;

export const HSBCNET_URL = 'https://www1.secure.hsbcnet.com';
export const SESSION_FILE = 'sessions/hsbcnet.json';

// 60s chờ 2FA lần đầu, 60s thêm sau resend
export const TWO_FA_TIMEOUT_MS = 60_000;

// ─── HSBCnet Excel column definitions ────────────────────────────────────────

// 5 cột bắt buộc — thiếu 1 trong số này thì job fail
export const REQUIRED_COLUMNS = [
  'Post date',
  'Narrative',
  'Bank reference',
  'Credit amount',
  'Debit amount',
] as const;

// Các cột còn lại — thiếu thì warn, không fail
export const OPTIONAL_COLUMNS = [
  'Account name',
  'Account number',
  'Bank name',
  'Currency',
  'Location',
  'BIC',
  'IBAN',
  'Account status',
  'Account type',
  'Closing ledger balance',
  'Closing ledger brought forward from',
  'Closing available balance',
  'Closing available brought forward from',
  'Current ledger balance',
  'Current ledger as at',
  'Current available balance',
  'Current available as at',
  'Customer reference',
  'TRN type',
  'Balance',
] as const;

export const ALL_KNOWN_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS] as const;

// Map từ Excel column name → TransactionRow field
export const COLUMN_FIELD_MAP: Record<string, string> = {
  'Post date':          'postDate',
  'Narrative':          'narrative',
  'Bank reference':     'bankReference',
  'Customer reference': 'customerReference',
  'TRN type':           'trnType',
  'Credit amount':      'creditAmount',
  'Debit amount':       'debitAmount',
  'Balance':            'balance',
};
