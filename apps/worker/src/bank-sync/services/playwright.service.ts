import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { HSBCNET_URL, SESSION_FILE, TWO_FA_TIMEOUT_MS } from '../constants';

// ─── HSBCnet UI selectors (verified from DevTools screenshots) ────────────────
const SELECTORS = {
  // Login page
  usernameInput:  '#userid',
  nextBtn:        'button#nextBtn, button[type="submit"]',
  authMethodBtn:  'button[data-testid="Button"], button[data-test-id="autoTestCDLButton"]',
  usernameError:  '#userid-error',

  // Post-login: Log off button — only present once authenticated
  dashboardEl: 'button.page-header__log-off',
  // Logged-in user name — span inside user-profile-container
  loggedInUser: '.user-profile-container span',
  // 2FA waiting screen — normal state, not an error
  twoFaPending: 'button[data-test-id="autoTestCDLButton"]',
  // Auth failed — user clicked Cancel or session expired → back to login
  authError: '#userid',

  // "Change account" search widget (present on any account detail page)
  changeAccountInput: 'input[aria-label*="account number or title"]',
  switcherList:       'ul.switcher-option[role="listbox"]',
  switcherItem:       'li.switcher-option--item[role="option"]',
  switcherCompany:    'p.switcher-option--number',
  switcherAccount:    'p.switcher-option--account',

  // Transaction list / filter
  specifyDateRange: 'span#showing_actual_range_quick_link',
  dateRangeWidget:  '[id*="rangeDate"]',
  applyBtn:         'input.form__control-button[type="submit"]',
  noTransactions:   'p.table__error-message',

  // Export dropdown
  exportTrigger: 'button#export-dropdown-trigger',
  excelOption:   '.user-action__drop-option--clickable',
} as const;

export type DiscoveredAccount = {
  companyName: string;
  accountNumber: string;
  countryCode: string;
  currency: string;
};

@Injectable()
export class PlaywrightService {
  private readonly logger = new Logger(PlaywrightService.name);
  private readonly sessionPath = path.join(process.cwd(), SESSION_FILE);

  private browser: import('playwright').Browser | null = null;
  private context: import('playwright').BrowserContext | null = null;
  private page: import('playwright').Page | null = null;
  // URL of account-detail page — saved after discovery, used as re-entry point in downloadStatement
  private accountDetailUrl: string | null = null;

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async init(): Promise<void> {
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
    const slowMo = Number(process.env.PLAYWRIGHT_SLOW_MO ?? (headless ? 0 : 600));
    this.browser = await chromium.launch({ headless, slowMo });
    this.logger.log(`Browser launched (headless=${headless}, slowMo=${slowMo}ms)`);

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

    this.context = await this.browser.newContext(storageState ? { storageState } : {});
    this.page = await this.context.newPage();
  }

  async close(): Promise<void> {
    // Don't log out — keeps the server session alive so next time cookies load without 2FA.
    // If "already logged on" occurs → isLoggedIn() auto-detects it and calls clearSession().
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.page = null;
    this.logger.log('Browser closed');
  }

  async clearSession(): Promise<void> {
    // Clear cookies in the context
    await this.context?.clearCookies().catch(() => {});
    // Delete the session file
    if (fs.existsSync(this.sessionPath)) {
      fs.unlinkSync(this.sessionPath);
      this.logger.log('Session file cleared');
    }
  }

  // ─── Session ────────────────────────────────────────────────────────────────

  async isLoggedIn(): Promise<boolean> {
    const page = this.requirePage();
    try {
      // Check the current page first — avoid navigating unnecessarily
      const el = await page.$(SELECTORS.dashboardEl);
      if (el) return true;

      // Navigate to HSBC if not already there
      if (!page.url().startsWith(HSBCNET_URL)) {
        await page.goto(HSBCNET_URL, { waitUntil: 'load', timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      }

      // After navigating — check if redirected to "already logged on"
      if (page.url().includes('generalError')) {
        this.logger.warn('"Already logged on" detected — clearing stale session, will re-login');
        await this.clearSession();
        return false;
      }

      const elAfter = await page.waitForSelector(SELECTORS.dashboardEl, { timeout: 5_000 }).catch(() => null);
      return elAfter !== null;
    } catch {
      return false;
    }
  }

  async login(username: string): Promise<void> {
    if (!username) throw new Error('HSBCNET_USERNAME is not configured');
    const page = this.requirePage();

    this.logger.log(`Navigating to ${HSBCNET_URL}`);
    await page.goto(HSBCNET_URL, { waitUntil: 'load', timeout: 30_000 });

    // Step 1: fill username
    const usernameInput = await page.waitForSelector(SELECTORS.usernameInput, { timeout: 10_000 }).catch(() => null);
    if (!usernameInput) {
      const url = page.url();
      const title = await page.title().catch(() => '');
      throw new Error(`LOGIN_FORM_NOT_FOUND — URL: ${url}, title: "${title}" — selector: "${SELECTORS.usernameInput}"`);
    }
    await page.fill(SELECTORS.usernameInput, username);
    // Click and wait for navigation to finish (avoids a race condition since window.location.href is used)
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {}),
      page.click(SELECTORS.nextBtn),
    ]);
    this.logger.log(`Đã nhập tên đăng nhập (${username}) — URL sau click: ${page.url()}`);

    const errorEl = await page.waitForSelector(SELECTORS.usernameError, { timeout: 4_000 }).catch(() => null);
    if (errorEl) {
      const msg = await errorEl.innerText().catch(() => '');
      this.logger.warn(`Username rejected: ${msg}`);
      throw new Error('INVALID_USERNAME');
    }

    // Step 2: auth method confirmation page (optional — some flows skip directly to 2FA)
    this.logger.log(`Tìm nút xác nhận phương thức đăng nhập — URL: ${page.url()}`);
    const authBtn = await page.waitForSelector(SELECTORS.authMethodBtn, { timeout: 15_000 }).catch(() => null);
    if (authBtn) {
      // Click and wait for navigation to the 2FA screen
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10_000 }).catch(() => {}),
        authBtn.click(),
      ]);
      this.logger.log(`Đã xác nhận phương thức — URL sau click: ${page.url()}`);
    } else {
      const url = page.url();
      const title = await page.title().catch(() => '');
      this.logger.warn(
        `Auth method button không tìm thấy sau 15s — selector: "${SELECTORS.authMethodBtn}", URL: ${url}, title: "${title}" — tiếp tục chờ 2FA`,
      );
    }
  }

  async wait2FA(): Promise<void> {
    const page = this.requirePage();
    this.logger.log('Waiting for 2FA approval on mobile…');

    // Log when the 2FA waiting screen appears (non-blocking)
    page.waitForSelector(SELECTORS.twoFaPending, { timeout: 10_000 })
      .then(() => this.logger.log('Màn hình 2FA xuất hiện — đang chờ phê duyệt trên thiết bị di động'))
      .catch(async () => {
        const url = page.url();
        const title = await page.title().catch(() => '');
        this.logger.warn(
          `Màn hình 2FA không xuất hiện sau 10s — selector: "${SELECTORS.twoFaPending}", URL: ${url}, title: "${title}"`,
        );
      });

    const result = await Promise.race([
      page.waitForSelector(SELECTORS.dashboardEl, { timeout: 0 }).then(() => 'ok' as const),
      page.waitForSelector(SELECTORS.authError,   { timeout: 0 }).then(() => 'err' as const),
      new Promise<'err'>((r) => setTimeout(() => r('err'), TWO_FA_TIMEOUT_MS)),
    ]);

    if (result !== 'ok') throw new Error('TIMEOUT_2FA');

    const userName = await page.$(SELECTORS.loggedInUser)
      .then(el => el?.innerText()).catch(() => '');
    this.logger.log(`2FA confirmed — logged in${userName ? ` as ${userName.trim()}` : ''}`);
  }

  async saveSession(): Promise<void> {
    const ctx = this.requireContext();
    const cookies = await ctx.cookies();
    const dir = path.dirname(this.sessionPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.sessionPath, JSON.stringify({ cookies }, null, 2), 'utf-8');
    this.logger.log(`Session saved → ${this.sessionPath}`);
  }

  // ─── Account Discovery ──────────────────────────────────────────────────────

  /**
   * Navigate to account detail page, open the "Change account" search to reveal
   * the full account switcher list, and scrape all available accounts.
   */
  async discoverAccounts(): Promise<DiscoveredAccount[]> {
    const page = this.requirePage();

    // Step 1: Navigate to Account Information page via top nav link
    this.logger.log(`[discover] Current URL before nav: ${page.url()}`);
    const accountInfoLink = page.locator('a, button').filter({ hasText: /account information/i }).first();
    if (await accountInfoLink.count() > 0) {
      this.logger.log('[discover] Clicking "Account information" nav link');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'load', timeout: 15_000 }).catch(() => {}),
        accountInfoLink.click(),
      ]);
    } else {
      this.logger.warn('[discover] "Account information" nav link not found on current page');
    }
    this.logger.log(`[discover] After nav — URL: ${page.url()}, title: "${await page.title()}"`);

    // Step 2: Click first clickable account row (`:first-child` was wrong — title row is first)
    const firstRow = await page.waitForSelector(
      '.table__row--clickable',
      { timeout: 10_000 },
    ).catch(() => null);
    if (!firstRow) {
      this.logger.warn(`[discover] No clickable account rows found — page title: "${await page.title()}"`);
      return [];
    }
    this.logger.log('[discover] Found first clickable account row — clicking');
    // Use Promise.all so Playwright knows this click will trigger navigation
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 20_000 }).catch(() => {}),
      firstRow.click(),
    ]);
    this.logger.log(`[discover] After row click — URL: ${page.url()}`);

    // Step 3: Find "Change account" search input
    this.logger.log(`[discover] Waiting for changeAccountInput: ${SELECTORS.changeAccountInput}`);
    const searchInput = await page.waitForSelector(SELECTORS.changeAccountInput, { timeout: 20_000 })
      .catch((err) => {
        this.logger.error(`[discover] changeAccountInput not found after 20s — URL: ${page.url()}, err: ${err.message}`);
        return null;
      });
    if (!searchInput) throw new Error('Change account input not found');

    // Save account-detail URL for use as re-entry point in downloadStatement()
    this.accountDetailUrl = page.url();
    this.logger.log(`[discover] Stored account-detail URL: ${this.accountDetailUrl}`);

    // Step 4: Click to open the switcher dropdown — retry a few times in case the click
    // lands before the page has finished hydrating (input is in the DOM but its onClick
    // handler isn't attached yet), which is a common race right after a full navigation.
    this.logger.log(`[discover] Waiting for switcher list: ${SELECTORS.switcherList}`);
    let switcher = null;
    for (let attempt = 1; attempt <= 3 && !switcher; attempt++) {
      await searchInput.click();
      switcher = await page.waitForSelector(SELECTORS.switcherList, { timeout: 4_000 }).catch(() => null);
      if (!switcher) this.logger.warn(`[discover] Switcher list not found (attempt ${attempt}/3) — retrying click`);
    }
    if (!switcher) throw new Error('Account switcher list not found');
    const items = await switcher.$$(SELECTORS.switcherItem);
    this.logger.log(`[discover] Found ${items.length} items in switcher`);

    const accounts: DiscoveredAccount[] = [];
    for (const item of items) {
      const companyName = await item.$eval(
        SELECTORS.switcherCompany,
        (el) => el.textContent?.trim() ?? '',
      ).catch(() => '');

      const accountEl = await item.$(SELECTORS.switcherAccount);
      if (!accountEl) continue;

      // accountNumber is the direct text node; <i> is country; <span> is currency
      const accountNumber = await accountEl.evaluate((el) =>
        Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent?.trim())
          .filter(Boolean)
          .join('')
          .trim(),
      );
      const countryCode = await accountEl.$eval('i', (el) => el.textContent?.trim() ?? '').catch(() => '');
      const currency = await accountEl.$eval('span', (el) => el.textContent?.trim() ?? '').catch(() => '');

      if (accountNumber) {
        accounts.push({ companyName, accountNumber, countryCode, currency });
      }
    }

    // Close the switcher dropdown
    await page.keyboard.press('Escape');
    this.logger.log(`Discovered ${accounts.length} accounts from switcher`);
    return accounts;
  }

  // ─── Statement Download ─────────────────────────────────────────────────────

  /**
   * Switch to the given account via "Change account", apply date range filter,
   * and download the Excel export. Returns null if no transactions found.
   */
  async downloadStatement(accountNumber: string, dateFrom: Date, dateTo: Date): Promise<Buffer | null> {
    const page = this.requirePage();
    const ctx = this.requireContext();

    // ── Step 1: Ensure we're on account-detail, then navigate via switcher ────
    const inputVisible = await page.$(SELECTORS.changeAccountInput)
      .then(el => el?.isVisible()).catch(() => false);
    if (!inputVisible) {
      const url = page.url();
      const title = await page.title().catch(() => '');
      this.logger.warn(`[${accountNumber}] changeAccountInput not visible — URL: ${url}, title: "${title}"`);
      const detailUrl = this.accountDetailUrl ?? `${HSBCNET_URL}/account-detail`;
      this.logger.log(`[${accountNumber}] Navigating back to account-detail: ${detailUrl}`);
      await page.goto(detailUrl, { waitUntil: 'load', timeout: 30_000 });
    }

    const searchInput = await page.waitForSelector(SELECTORS.changeAccountInput, { timeout: 15_000 });
    await searchInput.click();
    await searchInput.fill(accountNumber);

    const firstResult = await page.waitForSelector(SELECTORS.switcherItem, { timeout: 8_000 }).catch(() => null);
    if (!firstResult) {
      this.logger.warn(`Account ${accountNumber} not found in switcher — skipping`);
      return null;
    }
    await firstResult.click();
    this.logger.log(`${accountNumber}: switcher item clicked — waiting for page to update`);

    // ── Step 2: Open date filter ──────────────────────────────────────────────
    const specifyLink = await page.waitForSelector(SELECTORS.specifyDateRange, { timeout: 10_000 }).catch(() => null);
    if (specifyLink) {
      await specifyLink.click();
      await page.waitForTimeout(400);
    } else {
      const url = page.url();
      this.logger.warn(`${accountNumber}: "Specify date range" link không tìm thấy — selector: "${SELECTORS.specifyDateRange}", URL: ${url}`);
    }

    // Click the date range combobox to open the picker
    const rangeWidget = await page.waitForSelector(SELECTORS.dateRangeWidget, { timeout: 6_000 }).catch(() => null);
    if (rangeWidget) {
      await rangeWidget.click();
      await page.waitForTimeout(400);
    } else {
      const url = page.url();
      this.logger.warn(`${accountNumber}: Date range widget không tìm thấy — selector: "${SELECTORS.dateRangeWidget}", URL: ${url}`);
    }

    // ── Step 3: Fill in dates ─────────────────────────────────────────────────
    await this.fillDateRange(page, dateFrom, dateTo);

    // ── Step 4: Apply filter ──────────────────────────────────────────────────
    const applyBtn = await page.waitForSelector(SELECTORS.applyBtn, { timeout: 6_000 });
    await applyBtn.click();
    await page.waitForLoadState('load', { timeout: 20_000 }).catch(() => {});

    // ── Step 5: Check for empty results ──────────────────────────────────────
    const noTxnEl = await page.$(SELECTORS.noTransactions);
    if (noTxnEl) {
      const msg = (await noTxnEl.textContent())?.trim() ?? 'No transactions';
      this.logger.log(`${accountNumber}: ${msg}`);
      return null;
    }

    // ── Step 6: Export → Excel ────────────────────────────────────────────────
    await page.click(SELECTORS.exportTrigger);
    await page.waitForTimeout(300);

    const excelBtn = page.locator(SELECTORS.excelOption).filter({ hasText: 'Excel' }).first();

    // Set up the download listener BEFORE clicking to avoid a race condition (localhost returns the file very fast).
    // Handles both cases: download on the current tab (same-tab) or in a new tab (target="_blank").
    type DL = import('playwright').Download;
    const downloadPromise = new Promise<DL>((resolve, reject) => {
      const tid = setTimeout(() => reject(new Error('Download timeout 30s')), 30_000);
      const done = (dl: DL) => { clearTimeout(tid); resolve(dl); };
      page.once('download', done);                          // case: same tab
      ctx.once('page', (newPage) => newPage.once('download', done)); // case: new tab
    });

    await excelBtn.click();

    const download = await downloadPromise;
    const tmpPath = await download.path();
    if (!tmpPath) throw new Error(`Download path null for ${accountNumber}`);

    const buffer = await fs.promises.readFile(tmpPath);
    // Close the extra tab if one was opened (ignore if none)
    await download.page().close().catch(() => {});
    this.logger.log(`${accountNumber}: downloaded ${(buffer.length / 1024).toFixed(1)} KB`);
    return buffer;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Interact with the date range picker to fill start and end dates.
   * Tries multiple strategies since HSBCnet uses a custom widget.
   */
  private async fillDateRange(
    page: import('playwright').Page,
    dateFrom: Date,
    dateTo: Date,
  ): Promise<void> {
    const fromStr = formatDate(dateFrom);
    const toStr = formatDate(dateTo);

    // Strategy 1: standard text inputs appeared inside the picker popup
    const inputs = await page.$$('input[placeholder*="dd/mm"], input[class*="date-input"], .date-picker input[type="text"]');
    if (inputs.length >= 2) {
      await inputs[0].click({ clickCount: 3 });
      await inputs[0].fill(fromStr);
      await inputs[1].click({ clickCount: 3 });
      await inputs[1].fill(toStr);
      return;
    }

    // Strategy 2: .change-dateformat spans are the interactive elements
    const spans = await page.$$('.change-dateformat');
    if (spans.length >= 2) {
      await spans[0].click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type(fromStr);
      await spans[1].click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type(toStr);
      return;
    }

    // Strategy 3: keyboard type into focused widget after click
    await page.keyboard.type(fromStr);
    await page.keyboard.press('Tab');
    await page.keyboard.type(toStr);
    await page.keyboard.press('Tab');
  }

  private requirePage(): import('playwright').Page {
    if (!this.page) throw new Error('PlaywrightService not initialised — call init() first');
    return this.page;
  }

  private requireContext(): import('playwright').BrowserContext {
    if (!this.context) throw new Error('PlaywrightService not initialised — call init() first');
    return this.context;
  }
}

/** Format a Date as DD/MM/YYYY (HSBCnet input format). */
export function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Compute the sync date range based on settings. */
export function computeDateRange(mode: string, customDays: number): { from: Date; to: Date } {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  switch (mode) {
    case 'today':
      return { from: today, to: today };

    case 'last_7_days': {
      const from = new Date(today);
      from.setUTCDate(today.getUTCDate() - 6);
      return { from, to: today };
    }

    case 'custom': {
      const from = new Date(today);
      from.setUTCDate(today.getUTCDate() - (customDays > 0 ? customDays : 1));
      return { from, to: today };
    }

    case 'yesterday':
    default: {
      const yesterday = new Date(today);
      yesterday.setUTCDate(today.getUTCDate() - 1);
      return { from: yesterday, to: yesterday };
    }
  }
}
