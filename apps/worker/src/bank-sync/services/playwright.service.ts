import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { HSBCNET_URL, SESSION_FILE, TWO_FA_TIMEOUT_MS } from '../constants';

// ─── HSBCnet UI selectors — adjust to match actual page elements ──────────────
const SELECTORS = {
  usernameInput:    '#userid',
  nextBtn:          'button#nextBtn, button[type="submit"]',
  authMethodBtn:    'button[data-testid="Button"]',  // Continue on auth-method selection page
  passwordInput:    '#password',
  loginBtn:         'button#loginBtn, button[type="submit"]',
  // Element present only after successful authentication
  dashboardEl:      '#mainContent, .dashboard-content, #headerMenu',
  downloadNavLink:  'a[href*="transactionDownload"], a[href*="txnDownload"], a[href*="export"]',
  accountDropdown:  'select#accountNumber, select[name="accountNumber"], select[name="account"]',
  startDateInput:   'input#fromDate, input[name="fromDate"], input[name="startDate"]',
  endDateInput:     'input#toDate, input[name="toDate"], input[name="endDate"]',
  formatDropdown:   'select#fileFormat, select[name="format"], select[name="fileType"]',
  excelFormatValue: 'EXCEL',   // <option> value for Excel format — adjust if different
  downloadBtn:      'button#btnDownload, button[name="download"], button[type="submit"]',
} as const;

export type AccountInfo = {
  accountNumber: string;
  accountName: string;
  currency: string;
};

@Injectable()
export class PlaywrightService {
  private readonly logger = new Logger(PlaywrightService.name);
  private readonly sessionPath = path.join(process.cwd(), SESSION_FILE);

  // State: browser/context/page live as instance properties across method calls
  private browser: import('playwright').Browser | null = null;
  private context: import('playwright').BrowserContext | null = null;
  private page: import('playwright').Page | null = null;

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Launch the browser and load saved cookies if the session file exists.
   * If a browser is already running and responsive, reuses it (no relaunch).
   */
  async init(): Promise<void> {
    // Reuse existing browser if it's still alive
    if (this.browser !== null && this.page !== null) {
      try {
        await this.page.evaluate(() => true);
        this.logger.log('Reusing existing browser session');
        return;
      } catch {
        this.logger.warn('Existing browser became unresponsive — relaunching');
        this.browser = null;
        this.context = null;
        this.page = null;
      }
    }

    const { chromium } = await import('playwright');

    const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
    this.browser = await chromium.launch({ headless });
    this.logger.log(`Browser launched (headless=${headless})`);

    let storageState: import('playwright').BrowserContextOptions['storageState'];
    if (fs.existsSync(this.sessionPath)) {
      try {
        const raw = fs.readFileSync(this.sessionPath, 'utf-8');
        const parsed = JSON.parse(raw) as { cookies: import('playwright').Cookie[] };
        storageState = { cookies: parsed.cookies, origins: [] };
        this.logger.log(`Loaded saved session from ${this.sessionPath}`);
      } catch {
        this.logger.warn('Could not load session file — starting fresh');
      }
    }

    this.context = await this.browser.newContext(
      storageState ? { storageState } : {},
    );
    this.page = await this.context.newPage();
  }

  /** Close the browser. Only call on error or explicit shutdown. */
  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
    this.logger.log('Browser closed');
  }

  // ─── Session helpers ────────────────────────────────────────────────────────

  /**
   * Returns true if the page currently shows the post-login dashboard element.
   * Navigates to HSBCnet base URL first to ensure cookies are applied.
   */
  async isLoggedIn(): Promise<boolean> {
    const page = this.requirePage();
    try {
      await page.goto(HSBCNET_URL, { waitUntil: 'load', timeout: 30_000 });
      // Wait for any client-side redirects to settle before querying
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      const el = await page.waitForSelector(SELECTORS.dashboardEl, { timeout: 3_000 }).catch(() => null);
      return el !== null;
    } catch {
      return false;
    }
  }

  /**
   * Navigate to HSBCnet, enter username, click Continue — auth via mobile app (no password).
   */
  async login(username: string): Promise<void> {
    if (!username) throw new Error('HSBCNET_USERNAME is not configured');

    const page = this.requirePage();
    this.logger.log(`Navigating to ${HSBCNET_URL}`);
    await page.goto(HSBCNET_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    await page.fill(SELECTORS.usernameInput, username);
    await page.click(SELECTORS.nextBtn);

    // Check quickly if HSBC rejected the username (shows #userid-error within ~3s)
    const errorEl = await page.waitForSelector('#userid-error', { timeout: 4_000 }).catch(() => null);
    if (errorEl) {
      const msg = await errorEl.innerText().catch(() => '');
      this.logger.warn(`Username rejected by HSBCnet: ${msg}`);
      throw new Error('INVALID_USERNAME');
    }

    // Auth method selection page — click Continue to send notification to mobile
    this.logger.log('Username accepted — selecting authentication method');
    const authBtn = await page.waitForSelector(SELECTORS.authMethodBtn, { timeout: 15_000 }).catch(() => null);
    if (authBtn) {
      await authBtn.click();
      this.logger.log('Authentication method confirmed — waiting for 2FA approval on mobile');
    } else {
      this.logger.log('No auth method page detected — waiting for 2FA directly');
    }
  }

  /**
   * Wait until the dashboard element appears (2FA approved on phone).
   * Uses waitForSelector which is safe across page navigations.
   */
  async wait2FA(): Promise<void> {
    const page = this.requirePage();
    this.logger.log(`Waiting for 2FA (timeout ${TWO_FA_TIMEOUT_MS}ms)…`);
    try {
      await page.waitForSelector(SELECTORS.dashboardEl, { timeout: TWO_FA_TIMEOUT_MS });
      this.logger.log('2FA confirmed — dashboard element detected');
    } catch {
      throw new Error('TIMEOUT_2FA');
    }
  }

  /** Persist current browser cookies to the session JSON file. */
  async saveSession(): Promise<void> {
    const ctx = this.requireContext();
    const cookies = await ctx.cookies();
    const dir = path.dirname(this.sessionPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.sessionPath, JSON.stringify({ cookies }, null, 2), 'utf-8');
    this.logger.log(`Session saved → ${this.sessionPath}`);
  }

  // ─── Download ───────────────────────────────────────────────────────────────

  /**
   * Navigate to the transaction download section, select the account,
   * set date range to yesterday, choose Excel format and trigger the download.
   * Returns the downloaded file as a Buffer.
   */
  async downloadStatement(accountNumber: string): Promise<Buffer> {
    const page = this.requirePage();

    // Navigate to the download section
    await page.click(SELECTORS.downloadNavLink);
    await page.waitForLoadState('domcontentloaded');

    // Select account
    await page.selectOption(SELECTORS.accountDropdown, { value: accountNumber });

    // Date range: yesterday in DD/MM/YYYY format
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = formatDate(yesterday);
    await page.fill(SELECTORS.startDateInput, dateStr);
    await page.fill(SELECTORS.endDateInput, dateStr);

    // Select Excel format
    await page.selectOption(SELECTORS.formatDropdown, { value: SELECTORS.excelFormatValue });

    // Trigger download
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click(SELECTORS.downloadBtn),
    ]);

    const filePath = await download.path();
    if (!filePath) throw new Error(`Download failed for account ${accountNumber}`);

    const buffer = await fs.promises.readFile(filePath);
    this.logger.log(`Downloaded ${buffer.length} bytes for account ${accountNumber}`);
    return buffer;
  }

  /**
   * Stub — accounts are fetched from DB by BankSyncService, not from the browser.
   */
  async fetchAccounts(): Promise<AccountInfo[]> {
    return [];
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private requirePage(): import('playwright').Page {
    if (!this.page) throw new Error('PlaywrightService not initialised — call init() first');
    return this.page;
  }

  private requireContext(): import('playwright').BrowserContext {
    if (!this.context) throw new Error('PlaywrightService not initialised — call init() first');
    return this.context;
  }
}

/** Format a Date as DD/MM/YYYY (HSBCnet date input format). */
function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
