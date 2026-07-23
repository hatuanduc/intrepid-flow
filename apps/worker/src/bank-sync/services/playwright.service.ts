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

  // Transaction list / filter — verified end-to-end against the real page (console
  // script, run repeatedly): open "Filter / search" (only if not already expanded,
  // since it's a toggle), then open "Date range" via the first chevron inside that
  // panel (Date range is the first field in the row, before Transaction type), then
  // fill Date from/to. No other intermediate click is needed or used.
  filtersPanelTrigger: '#transactions-filters-panel-trigger',
  filtersPanel:        '#transactions-filters-panel',
  dateFromInput:       '#dateFieldFrom-field',
  dateToInput:         '#dateFieldTo-field',
  dateRangeChevron:    '[data-testid="ChevronDownIcon"]',
  noTransactions:      'p.table__error-message',

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
    // --disable-blink-features=AutomationControlled + a non-headless UA/viewport below —
    // HSBCnet's WAF (F5 BIG-IP ASM) intermittently fingerprints vanilla headless Chromium
    // (navigator.webdriver=true, "HeadlessChrome" UA string, 800x600 default viewport) and
    // serves a "Service Unavailable" page instead of the real login form (LOGIN_FORM_NOT_FOUND).
    this.browser = await chromium.launch({
      headless,
      slowMo,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    this.logger.log(`Browser launched (headless=${headless}, slowMo=${slowMo}ms)`);

    // Passing the file path directly lets Playwright restore both cookies AND
    // localStorage/sessionStorage per origin — a hand-rolled cookies-only version
    // previously discarded origins, which HSBCnet's SPA relies on for session state.
    const storageState = fs.existsSync(this.sessionPath) ? this.sessionPath : undefined;
    if (storageState) this.logger.log(`Loaded saved session from ${this.sessionPath}`);

    this.context = await this.browser.newContext({
      ...(storageState ? { storageState } : {}),
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    });
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
    // Clear cookies AND localStorage in the live context — now that saveSession()
    // persists both, a stale login attempt could otherwise reuse leftover localStorage
    // state (e.g. a device/session marker) even after cookies are wiped.
    await this.context?.clearCookies().catch(() => {});
    await this.page?.evaluate(() => localStorage.clear()).catch(() => {});
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

      // If the login form is already showing, we know we're logged out immediately —
      // no need to burn the full 5s waiting for a dashboard element that provably
      // can't appear on this page.
      const onLoginPage = await page.$(SELECTORS.usernameInput);
      if (onLoginPage) return false;

      const elAfter = await page.waitForSelector(SELECTORS.dashboardEl, { timeout: 5_000 }).catch(() => null);
      return elAfter !== null;
    } catch {
      return false;
    }
  }

  async login(username: string): Promise<void> {
    if (!username) throw new Error('HSBCNET_USERNAME is not configured');
    const page = this.requirePage();

    // isLoggedIn() (called right before this) already navigates to HSBCNET_URL and leaves
    // us sitting on the login form when logged out — reloading it here would just re-fetch
    // and re-render the same heavy page for no reason, adding several seconds of dead time.
    const alreadyOnLoginPage = await page.$(SELECTORS.usernameInput) !== null;
    if (!alreadyOnLoginPage) {
      this.logger.log(`Navigating to ${HSBCNET_URL}`);
      await page.goto(HSBCNET_URL, { waitUntil: 'load', timeout: 30_000 });
    }

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

  async wait2FA(shouldCancel?: () => Promise<boolean>): Promise<void> {
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

    // The dashboard/authError selectors use timeout:0 (wait forever) — up to 5 minutes
    // of real wall-clock time (TWO_FA_TIMEOUT_MS) where a Cancel click from the UI would
    // otherwise go unnoticed, since nothing here ever re-checked job status while blocked.
    // Poll shouldCancel alongside the other racers so a cancel actually interrupts this.
    const cancelWatch: Promise<'cancelled'> = shouldCancel
      ? (async (): Promise<'cancelled'> => {
          for (;;) {
            await new Promise(r => setTimeout(r, 3_000));
            if (await shouldCancel()) return 'cancelled';
          }
        })()
      : new Promise<'cancelled'>(() => {}); // no shouldCancel provided — never resolves, inert racer

    const result = await Promise.race([
      page.waitForSelector(SELECTORS.dashboardEl, { timeout: 0 }).then(() => 'ok' as const),
      page.waitForSelector(SELECTORS.authError,   { timeout: 0 }).then(() => 'err' as const),
      new Promise<'err'>((r) => setTimeout(() => r('err'), TWO_FA_TIMEOUT_MS)),
      cancelWatch,
    ]);

    if (result === 'cancelled') throw new Error('JOB_CANCELLED');
    if (result !== 'ok') throw new Error('TIMEOUT_2FA');

    const userName = await page.$(SELECTORS.loggedInUser)
      .then(el => el?.innerText()).catch(() => '');
    this.logger.log(`2FA confirmed — logged in${userName ? ` as ${userName.trim()}` : ''}`);
  }

  async saveSession(): Promise<void> {
    const ctx = this.requireContext();
    const dir = path.dirname(this.sessionPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Full storage state — cookies + localStorage/sessionStorage per origin.
    await ctx.storageState({ path: this.sessionPath });
    this.logger.log(`Session saved → ${this.sessionPath}`);
  }

  // ─── Account Discovery ──────────────────────────────────────────────────────

  /**
   * Navigate to account detail page, open the "Change account" search to reveal
   * the full account switcher list, and scrape all available accounts.
   */
  async discoverAccounts(): Promise<DiscoveredAccount[]> {
    const page = this.requirePage();

    // Step 1: Navigate to Account Information page via the SPA's hash route.
    // The nav link text ("Account information") matches two DOM elements — a hidden
    // copy inside the collapsed hamburger menu and the visible "pinned" top-bar one —
    // and Playwright's locator can resolve/click the hidden copy, hanging forever on
    // the visibility check. The app routes purely off location.hash, so setting it
    // directly sidesteps the DOM entirely.
    this.logger.log(`[discover] Current URL before nav: ${page.url()}`);
    await page.evaluate(() => { window.location.hash = '/accounts'; });
    await page.waitForURL(/#\/accounts/, { timeout: 15_000 }).catch(() => {});
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
  async downloadStatement(
    accountNumber: string,
    dateFrom: Date,
    dateTo: Date,
    shouldCancel?: () => Promise<boolean>,
  ): Promise<Buffer | null> {
    const page = this.requirePage();
    const ctx = this.requireContext();

    // downloadStatement() itself can take 30-60+ seconds across its several steps —
    // the caller's own cancellation check only runs BETWEEN accounts, so without this,
    // a user cancelling mid-account has to wait for the whole thing to finish (and the
    // job then moves on to the NEXT account before it ever notices). Checking at each
    // step boundary here lets a cancellation take effect within seconds instead.
    async function checkCancelled() {
      if (shouldCancel && await shouldCancel()) throw new Error('JOB_CANCELLED');
    }

    await checkCancelled();

    // ── Step 1: Confirm we're on account-detail ───────────────────────────────
    // Switching accounts never leaves this page — it's all done via the "Change
    // account" search below. Give the search input a real grace window to (re)appear
    // in case it's mid re-render right after the previous account's export. If it's
    // still missing after that, something upstream is genuinely broken (wrong page,
    // session dropped, HSBC layout changed) — fail loudly instead of papering over
    // it with a speculative page.goto() reload, which was liable to land somewhere
    // unexpected and retrigger HSBC's post-navigation "LastLogin" popup tab.
    const inputVisible = await page.waitForSelector(SELECTORS.changeAccountInput, { state: 'visible', timeout: 8_000 })
      .then(() => true).catch(() => false);
    if (!inputVisible) {
      // Full technical detail → app log (console/CloudWatch). The thrown message is
      // what ends up in the user-facing job log, so keep it short and non-technical.
      this.logger.error(`[${accountNumber}] changeAccountInput not visible — URL: ${page.url()}, title: "${await page.title().catch(() => '')}"`);
      throw new Error('Could not find the account search box on the HSBC page.');
    }

    const searchInput = await page.waitForSelector(SELECTORS.changeAccountInput, { timeout: 15_000 });
    await searchInput.click();
    await searchInput.fill(accountNumber);

    // Use a Locator (not ElementHandle) so Playwright re-queries the DOM at click
    // time — HSBC re-renders the switcher list while filtering, causing stale handles.
    // accountNumber came from this same switcher during discovery, so searching for
    // it again should always resolve — if it doesn't, that's a real bug (bad format,
    // stale search, layout change), not a benign "account closed" case. Fail loudly
    // instead of silently returning null, which the caller would otherwise log as
    // indistinguishable from a genuine "no transactions in range".
    const firstResult = page.locator(SELECTORS.switcherItem).first();
    try {
      await firstResult.waitFor({ state: 'visible', timeout: 8_000 });
    } catch {
      this.logger.error(`Account ${accountNumber} not found in switcher after searching — URL: ${page.url()}`);
      throw new Error(`Account ${accountNumber} not found in HSBC's account list.`);
    }
    await firstResult.click();
    this.logger.log(`${accountNumber}: switcher item clicked — waiting for page to update`);
    await checkCancelled();

    // ── Step 2: Open "Filter / search" panel (only if not already open) ──────
    // Verified end-to-end against the real page via a console script run repeatedly:
    // "Filter / search" is a toggle (aria-expanded) — only click it if it isn't
    // already expanded, since a redundant click would close it.
    const filterTrigger = page.locator(SELECTORS.filtersPanelTrigger);
    const filterTriggerVisible = await filterTrigger.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false);
    if (!filterTriggerVisible) {
      this.logger.error(`"Filter / search" trigger not found — selector: "${SELECTORS.filtersPanelTrigger}", URL: ${page.url()}`);
      throw new Error('Could not find the filter panel on the HSBC page.');
    }
    const filterAlreadyOpen = await filterTrigger.getAttribute('aria-expanded').catch(() => null);
    if (filterAlreadyOpen !== 'true') {
      await filterTrigger.click({ force: true }).catch(() => {});
    }
    const filtersPanel = page.locator(SELECTORS.filtersPanel);
    const filtersPanelVisible = await filtersPanel.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true).catch(() => false);
    if (!filtersPanelVisible) {
      this.logger.error(`[${accountNumber}] "Filter / search" panel did not open — URL: ${page.url()}`);
      throw new Error('Could not find the filter panel on the HSBC page.');
    }

    // ── Step 3: Open "Date range" (chevron scoped inside the filters panel) ───
    // "Date range" is the first field in the filter row (before Transaction type),
    // so the first chevron inside the panel belongs to it. Retries verify the real
    // outcome (the From field becoming visible) rather than trusting the click alone.
    const dateRangeChevron = filtersPanel.locator(SELECTORS.dateRangeChevron).first();
    const fromFieldLoc = page.locator(SELECTORS.dateFromInput);
    let panelOpen = await fromFieldLoc.waitFor({ state: 'visible', timeout: 500 }).then(() => true).catch(() => false);
    for (let attempt = 1; attempt <= 3 && !panelOpen; attempt++) {
      await checkCancelled();
      try {
        await dateRangeChevron.click({ timeout: 5_000, force: true });
      } catch (err) {
        this.logger.warn(`"Date range" chevron click failed (attempt ${attempt}/3) — ${(err as Error).message.split('\n')[0]}`);
      }
      panelOpen = await fromFieldLoc.waitFor({ state: 'visible', timeout: 2_500 }).then(() => true).catch(() => false);
    }
    if (!panelOpen) {
      this.logger.error(`[${accountNumber}] "Date range" did not open after 3 attempts — URL: ${page.url()}`);
      throw new Error('Could not find the date range option on the HSBC page.');
    }

    // ── Step 4: Fill in dates ─────────────────────────────────────────────────
    await this.fillDateRange(page, dateFrom, dateTo, shouldCancel);

    // ── Step 5: Wait for the auto-triggered search ────────────────────────────
    // Typing the "to" date fires HSBC's own search — no separate Apply click needed
    // (verified: the console script never clicks anything else and the table updates).
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    // ── Step 6: Check for empty results ──────────────────────────────────────
    const noTxnEl = await page.$(SELECTORS.noTransactions);
    if (noTxnEl) {
      const msg = (await noTxnEl.textContent())?.trim() ?? 'No transactions';
      this.logger.log(`${accountNumber}: ${msg}`);
      return null;
    }

    await checkCancelled();

    // ── Step 7: Export → Excel ────────────────────────────────────────────────
    // The Export button also toggles a dropdown open/closed (aria-haspopup="listbox",
    // aria-expanded) — same failure mode as "Specify date range": clickWithRetry()
    // blindly retrying on any Playwright-level click timeout can close a dropdown
    // that already opened, if the click itself succeeded but Playwright's own
    // post-click stability wait timed out for an unrelated reason. Verify the actual
    // outcome (the Excel option becoming visible) between attempts instead.
    const exportTriggerLoc = page.locator(SELECTORS.exportTrigger);
    const excelBtn = page.locator(SELECTORS.excelOption).filter({ hasText: 'Excel' }).first();
    let exportOpen = false;
    for (let attempt = 1; attempt <= 3 && !exportOpen; attempt++) {
      await checkCancelled();
      try {
        await exportTriggerLoc.click({ timeout: 5_000, force: true });
      } catch (err) {
        // Playwright's own error includes its full actionability call log (dozens of
        // lines) — useful for us, meaningless and alarming to an end user reading the
        // job log. Full detail → app log only.
        this.logger.warn(`Export button click failed (attempt ${attempt}/3) — ${(err as Error).message.split('\n')[0]}`);
      }
      exportOpen = await excelBtn.waitFor({ state: 'visible', timeout: 2_500 }).then(() => true).catch(() => false);
    }
    if (!exportOpen) {
      this.logger.error(`[${accountNumber}] Export dropdown did not open after 3 attempts — URL: ${page.url()}`);
      throw new Error(`Could not find or click the Export button for ${accountNumber} on the HSBC page.`);
    }

    // Set up the download listener BEFORE clicking to avoid a race condition (localhost returns the file very fast).
    // Handles both cases: download on the current tab (same-tab) or in a new tab (target="_blank").
    type DL = import('playwright').Download;
    const downloadPromise = new Promise<DL>((resolve, reject) => {
      const tid = setTimeout(() => reject(new Error('Download timeout 30s')), 30_000);
      const done = (dl: DL) => { clearTimeout(tid); resolve(dl); };
      page.once('download', done);                          // case: same tab
      ctx.once('page', (newPage) => newPage.once('download', done)); // case: new tab
    });

    try {
      await this.clickWithRetry(excelBtn, 'Excel export option', 3, 5_000, shouldCancel);
    } catch (err) {
      this.logger.error(`[${accountNumber}] Excel option click failed — ${(err as Error).message}`);
      throw new Error(`Could not find or click the Excel export option for ${accountNumber} on the HSBC page.`);
    }

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
    shouldCancel?: () => Promise<boolean>,
  ): Promise<void> {
    const fromStr = formatDate(dateFrom);
    const toStr = formatDate(dateTo);

    // Strategy 1: verified From/To inputs (DevTools-confirmed IDs). Filled via
    // fillAndVerify() rather than a plain .fill() — the "to" field is known to
    // sometimes swallow its first click while the widget is mid-re-render, silently
    // leaving the field empty with no error; verifying + retrying catches that
    // instead of continuing on to a confusing failure several steps later.
    //
    // The existence check below WAITS for each field (up to 8s) rather than using
    // Locator.count(), which resolves instantly against whatever's in the DOM at
    // that exact moment. In headless mode (slowMo: 0 — see init()), the panel can
    // still be mid-render right when this runs; a plain .count() check would read
    // 0 in that split second and silently fall through every strategy below,
    // landing on Strategy 4's blind keyboard input — which throws nothing and
    // "succeeds" instantly without typing into anything real. Waiting here closes
    // that race instead of masking it.
    const fromInput = page.locator(SELECTORS.dateFromInput);
    const toInput = page.locator(SELECTORS.dateToInput);
    const fromVisible = await fromInput.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
    const toVisible = fromVisible && await toInput.waitFor({ state: 'visible', timeout: 8_000 }).then(() => true).catch(() => false);
    if (fromVisible && toVisible) {
      await this.fillAndVerify(fromInput, fromStr, 'Date from', 3, shouldCancel);
      await this.fillAndVerify(toInput, toStr, 'Date to', 3, shouldCancel);
      return;
    }

    // Strategy 2: standard text inputs appeared inside the picker popup
    const inputLoc = page.locator('input[placeholder*="dd/mm"], input[class*="date-input"], .date-picker input[type="text"]');
    if (await inputLoc.count() >= 2) {
      await inputLoc.nth(0).click({ clickCount: 3 });
      await inputLoc.nth(0).fill(fromStr);
      await inputLoc.nth(1).click({ clickCount: 3 });
      await inputLoc.nth(1).fill(toStr);
      return;
    }

    // Strategy 3: .change-dateformat spans are the interactive elements
    const spanLoc = page.locator('.change-dateformat');
    if (await spanLoc.count() >= 2) {
      await spanLoc.nth(0).click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type(fromStr);
      await spanLoc.nth(1).click();
      await page.keyboard.press('Control+a');
      await page.keyboard.type(toStr);
      return;
    }

    // Strategies 1-3 all use verified/known selectors — if none of them matched,
    // blindly typing into "whatever currently has focus" has no chance of landing
    // on the right field and would silently look like success (no error, no wait).
    // That's exactly what masked the real bug once already (see fillDateRange()'s
    // comment above) — fail loudly instead of guessing.
    throw new Error('Could not find the date range input fields on the HSBC page (tried all known selectors).');
  }

  /**
   * Set the value via the native input-value setter + input/change events, read it
   * back, and retry if it didn't stick. This bypasses Playwright's own .fill(), which
   * refuses to act until the element passes its actionability checks (visible,
   * enabled, stable) — checks this specific widget intermittently fails even though
   * the field is genuinely there and editable (confirmed: the exact same native-
   * setter approach, run directly in the browser console against this same page,
   * worked reliably every time). Mirrors the pattern already proven manually instead
   * of continuing to fight Playwright's stricter actionability model.
   */
  private async fillAndVerify(
    locator: import('playwright').Locator,
    value: string,
    label: string,
    attempts = 3,
    shouldCancel?: () => Promise<boolean>,
  ): Promise<void> {
    let lastActual = '';
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (shouldCancel && await shouldCancel()) throw new Error('JOB_CANCELLED');
      lastActual = await locator.evaluate((el: HTMLInputElement, val: string) => {
        const proto = Object.getPrototypeOf(el);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        desc?.set?.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return el.value;
      }, value).catch(() => '');
      if (lastActual === value) return;
      this.logger.warn(`${label}: fill did not stick (attempt ${attempt}/${attempts}) — expected "${value}", got "${lastActual}"`);
      await new Promise(r => setTimeout(r, 400));
    }
    throw new Error(`Could not fill "${label}" — value stayed "${lastActual}" instead of "${value}" after ${attempts} attempts.`);
  }

  /**
   * Click with retries — covers the case where a critical-path element renders
   * slower than the script runs (element exists but isn't yet interactive/stable).
   * Fails loudly with a clear label after exhausting all attempts, instead of
   * surfacing Playwright's raw actionability-check error to the caller.
   *
   * force: true skips Playwright's own actionability checks (visible/stable/not
   * obscured) — real production logs showed this widget's Export toggle timing out
   * on those checks (plain "Timeout 5000ms exceeded", no further detail) even though
   * a raw DOM .click() on the same element, run directly in the browser console
   * against this same page, worked immediately every time. force skips straight to
   * the actual click instead of waiting out a check that keeps failing regardless.
   */
  private async clickWithRetry(
    locator: import('playwright').Locator,
    label: string,
    attempts = 3,
    timeoutMs = 5_000,
    shouldCancel?: () => Promise<boolean>,
  ): Promise<void> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (shouldCancel && await shouldCancel()) throw new Error('JOB_CANCELLED');
      try {
        await locator.click({ timeout: timeoutMs, force: true });
        return;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
        this.logger.warn(`${label}: click failed (attempt ${attempt}/${attempts}) — ${msg}`);
        await new Promise(r => setTimeout(r, 500));
      }
    }
    throw new Error(`Could not find or click "${label}" after ${attempts} attempts — ${lastErr instanceof Error ? lastErr.message.split('\n')[0] : String(lastErr)}`);
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
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);

  switch (mode) {
    case 'today':
      return { from: today, to: today };

    // HSBC data for yesterday and earlier is final; today's can still change through
    // the day. "last_7_days" and "custom" are both meant to backfill settled history,
    // so their range always ends at yesterday, never today — otherwise every run would
    // re-fetch today's still-shifting data for nothing, and each account's
    // lastSyncedTo (which future runs use to skip re-downloading) would never
    // stabilize past "today" from one run to the next.
    case 'last_7_days': {
      const from = new Date(yesterday);
      from.setUTCDate(yesterday.getUTCDate() - 6);
      return { from, to: yesterday };
    }

    case 'custom': {
      const days = customDays > 0 ? customDays : 1;
      const from = new Date(yesterday);
      from.setUTCDate(yesterday.getUTCDate() - (days - 1));
      return { from, to: yesterday };
    }

    case 'yesterday':
    default:
      return { from: yesterday, to: yesterday };
  }
}
