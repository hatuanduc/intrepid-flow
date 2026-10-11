import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { HSBCNET_URL, SESSION_FILE, TWO_FA_TIMEOUT_MS, DEBUG_SCREENSHOT_DIR } from '../constants';

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
  // Confirmed via a captured "before export click" debug snapshot (see
  // captureDebugSnapshot() call sites): the table is still showing this spinner —
  // <div class="spinner" role="loader" aria-describedby="Loading"> inside
  // .account-transactions-table — at the exact moment the date-range networkidle wait
  // below was satisfied. networkidle only means the NETWORK settled, not that the
  // table finished re-rendering afterward; clicking Export while this spinner is still
  // up is the prime suspect for the stuck-page crash a "Download timeout" then cascades
  // into for every account after it in the same job.
  transactionsLoadingSpinner: '.account-transactions-table .spinner[role="loader"]',
  // Confirmed via a captured debug snapshot on a real, active account (444 stored
  // transactions, most recent posted yesterday — not a dormant/empty one): right after
  // switching to it, HSBC can momentarily show "Transaction details are only available
  // for the previous 365 days. Please adjust your dates." in place of the normal
  // filter row, with the "Date range" chevron this flow needs nowhere in the DOM —
  // hence "Could not find the date range option" for an account that plainly isn't
  // actually restricted. Same class of transient not-ready-yet state the transactions
  // spinner above covers, just a different placeholder. "Clear all" sits right next to
  // this message and is the same recovery a human would reach for.
  retentionErrorMessage: '.table__retention-error-message',
  clearAllFiltersLink:   'a.table-filters__link',

  // Export dropdown
  exportTrigger: 'button#export-dropdown-trigger',
  excelOption:   '.user-action__drop-option--clickable',

  // Per-row "..." action button + "Chi tiết giao dịch" popup (PDF export) — verified
  // from DevTools screenshots. Only Transfer (ủy nhiệm chi) rows render this button at
  // all — confirmed against the real site: a credit/RT PYMT row has no such element in
  // its DOM. Scoped inside .account-transactions-table (also confirmed via DevTools —
  // see the CSS rule ".account-transactions-table .table-wrapper .table__body tr td
  // .showLastCellBorder button") specifically to avoid matching a stale button left over
  // from a PREVIOUS account's table after switching accounts — production logs showed
  // the exact same id (transaction_action_button_0) "found" across 13 different real
  // accounts in a row, which is the signature of a leftover DOM node, not a fresh one.
  rowActionBtn:      '.account-transactions-table button[id^="transaction_action_button_"]',
  rowActionDropdown: (idSuffix: string) => `#transaction-more-dropdown-${idSuffix}`,
  detailModal:       '.dialogue-window__TXNDetail',
  detailPdfBtn:      '.dialogue-window__button-group__action-btn[aria-label="Export PDF"]',
  detailCloseBtn:    '.dialogue-window__button-group__action-btn--close',
  paginationNextBtn: 'a.pagination__link--arrow[aria-label="next page"]',
} as const;

// The row action button's aria-label embeds the customer reference + exact post
// timestamp directly (confirmed via DevTools screenshot: `aria-label="Menu Thao tác,
// ... cho giao dịchof the Mã tham chiếu khách hàng:INTREPID301097, at 28 Aug 2026
// 10:49"`) — parsing this one string is more robust than reading several <td> cells
// in a fixed column order, since it doesn't depend on the table's column layout.
//
// HSBCnet renders this label in whatever language the logged-in user's own profile
// is set to, not a fixed one — an English-profile session reads "...of the Customer
// reference:X, at Y" instead. Matching only the Vietnamese label silently dropped
// every row (no match → warn + skip) for any English-profile account, with nothing
// in the job log to explain why pdf_export always fetched 0 — confirmed live against
// a real English-profile HSBCnet session.
const ROW_REFERENCE_RE = /(?:Mã tham chiếu khách hàng|Customer reference):([^,]+), at (.+)$/;

export type PdfRowKey = { reference: string; dateTimeLabel: string };

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
  private readonly screenshotDir = path.join(process.cwd(), DEBUG_SCREENSHOT_DIR);

  private browser: import('playwright').Browser | null = null;
  private context: import('playwright').BrowserContext | null = null;
  private page: import('playwright').Page | null = null;

  // Best-effort diagnostic capture for hard-to-reproduce navigation failures — never
  // lets a capture problem mask the real error that triggered it. Local-disk-only: the
  // worker container is the only consumer of these (debugging, not served to users), so
  // it doesn't need the durable cross-container store bank statement PDFs use.
  private async saveDebugArtifact(buffer: Buffer, filenameStem: string, ext: string): Promise<string | null> {
    try {
      await fs.promises.mkdir(this.screenshotDir, { recursive: true });
      const filePath = path.join(this.screenshotDir, `${filenameStem}.${ext}`);
      await fs.promises.writeFile(filePath, buffer);
      return filePath;
    } catch (err) {
      this.logger.warn(`Failed to save debug artifact "${filenameStem}.${ext}" — ${(err as Error).message}`);
      return null;
    }
  }

  // Screenshot + full HTML together, as one labeled snapshot — a screenshot alone
  // shows WHAT the page looks like, the HTML is what actually lets you tell WHY (an
  // error boundary's fallback markup, a stale/detached component, an empty root div).
  private async captureDebugSnapshot(page: import('playwright').Page, label: string): Promise<string> {
    const timestamp = Date.now();
    const [screenshotBuf, htmlStr] = await Promise.all([
      page.screenshot({ fullPage: true }).catch((err) => {
        this.logger.warn(`Failed to capture debug screenshot for "${label}" — ${(err as Error).message}`);
        return null;
      }),
      page.content().catch((err) => {
        this.logger.warn(`Failed to capture debug HTML for "${label}" — ${(err as Error).message}`);
        return null;
      }),
    ]);
    const parts: string[] = [];
    if (screenshotBuf) {
      const p = await this.saveDebugArtifact(screenshotBuf, `${label}-${timestamp}`, 'png');
      if (p) parts.push(`screenshot: ${p}`);
    }
    if (htmlStr) {
      const p = await this.saveDebugArtifact(Buffer.from(htmlStr, 'utf-8'), `${label}-${timestamp}`, 'html');
      if (p) parts.push(`html: ${p}`);
    }
    return parts.join(', ');
  }

  // Buffered, in-memory version of the above — captured BEFORE a risky action (e.g.
  // the Excel export click) without writing anything yet. Call persistPreActionSnapshot()
  // after to actually save it, but only when that action turned out to fail — the vast
  // majority of accounts succeed, and writing a "before" snapshot for every single one
  // of them regardless would flood local disk/S3 with nothing but noise.
  private async capturePreActionSnapshot(page: import('playwright').Page): Promise<{ screenshot: Buffer | null; html: string | null }> {
    const [screenshot, html] = await Promise.all([
      page.screenshot({ fullPage: true }).catch(() => null),
      page.content().catch(() => null),
    ]);
    return { screenshot, html };
  }

  private async persistPreActionSnapshot(label: string, snapshot: { screenshot: Buffer | null; html: string | null }): Promise<string> {
    const timestamp = Date.now();
    const parts: string[] = [];
    if (snapshot.screenshot) {
      const p = await this.saveDebugArtifact(snapshot.screenshot, `${label}-${timestamp}`, 'png');
      if (p) parts.push(`screenshot: ${p}`);
    }
    if (snapshot.html) {
      const p = await this.saveDebugArtifact(Buffer.from(snapshot.html, 'utf-8'), `${label}-${timestamp}`, 'html');
      if (p) parts.push(`html: ${p}`);
    }
    return parts.join(', ');
  }

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
    // A small delay even in headless mode is a cheap hedge against HSBC's WAF/backend
    // treating a burst of instant, back-to-back actions as bot-like — production logs
    // showed a stalled Export/Download cascading through the rest of a job, something
    // never reproduced locally in headed mode (which already paces itself via the
    // 600ms default below). Not proven to be the cause, but low-risk to try; override
    // with PLAYWRIGHT_SLOW_MO=0 if it turns out to just add latency for no benefit.
    const slowMo = Number(process.env.PLAYWRIGHT_SLOW_MO ?? (headless ? 250 : 600));
    // --disable-blink-features=AutomationControlled + a non-headless UA/viewport below —
    // HSBCnet's WAF (F5 BIG-IP ASM) intermittently fingerprints vanilla headless Chromium
    // (navigator.webdriver=true, "HeadlessChrome" UA string, 800x600 default viewport) and
    // serves a "Service Unavailable" page instead of the real login form (LOGIN_FORM_NOT_FOUND).
    this.browser = await chromium.launch({
      headless,
      slowMo,
      // --disable-gpu: production runs headed (see comment above) against Xvfb on EC2,
      // which has no real GPU — Chromium's hardware compositor falling back badly in
      // that setup is a well-known cause of solid-black screenshots/renders in headed-
      // via-Xvfb Docker setups. Forces the software rasterizer instead.
      args: ['--disable-blink-features=AutomationControlled', '--disable-gpu'],
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
   * Navigate to account detail page, then search the "Change account" switcher
   * once per known company name and scrape whatever accounts come back.
   *
   * Searching per-name (instead of opening the switcher unfiltered and reading
   * every item at once) works around HSBC's switcher list being capped — an
   * unfiltered open only ever renders a bounded page of items (observed: exactly
   * 20, regardless of how many accounts actually exist — e.g. a company with 3
   * real accounts came back with only 1 when read from the unfiltered list,
   * while every company whose accounts happened to fall within the first 20
   * looked completely fine). Filtering by the company's own title first keeps
   * each result set well under that cap, so nothing past position 20 is ever
   * silently dropped.
   */
  async discoverAccounts(companyNames: string[]): Promise<DiscoveredAccount[]> {
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
    let switcherOpen = null;
    for (let attempt = 1; attempt <= 3 && !switcherOpen; attempt++) {
      await searchInput.click();
      switcherOpen = await page.waitForSelector(SELECTORS.switcherList, { timeout: 4_000 }).catch(() => null);
      if (!switcherOpen) this.logger.warn(`[discover] Switcher list not found (attempt ${attempt}/3) — retrying click`);
    }
    if (!switcherOpen) throw new Error('Account switcher list not found');

    // Step 5: search once per known company name, scraping whatever comes back for
    // each — see the method doc comment above for why (switcher list page cap).
    // `.fill()` replaces the input's full value each time, so no explicit clear is
    // needed between names.
    const accounts: DiscoveredAccount[] = [];
    const seenAccountNumbers = new Set<string>();

    for (const companyName of companyNames) {
      await searchInput.fill(companyName);
      const switcher = await page.waitForSelector(SELECTORS.switcherList, { timeout: 5_000 }).catch(() => null);
      if (!switcher) {
        this.logger.warn(`[discover] No switcher results for "${companyName}"`);
        continue;
      }

      const items = await switcher.$$(SELECTORS.switcherItem);
      this.logger.log(`[discover] "${companyName}": ${items.length} account(s) found`);

      for (const item of items) {
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
        if (!accountNumber || seenAccountNumbers.has(accountNumber)) continue;

        const countryCode = await accountEl.$eval('i', (el) => el.textContent?.trim() ?? '').catch(() => '');
        const currency = await accountEl.$eval('span', (el) => el.textContent?.trim() ?? '').catch(() => '');

        seenAccountNumbers.add(accountNumber);
        accounts.push({ companyName, accountNumber, countryCode, currency });
      }
    }

    // Close the switcher dropdown
    await page.keyboard.press('Escape');

    // Give the page a moment to settle after the discovery scan (fresh login + 2FA +
    // searching the switcher once per company name) before the very first real
    // account fetch fires an Export/Download click straight after. Production logs
    // showed the account processed FIRST after discovery hitting a stalled download
    // that then cascaded through the rest of the job — plausibly the page/session
    // still catching up right at that transition. Cheap and harmless if it wasn't
    // actually needed; local testing (headed, slowMo between actions) never hit this,
    // only headless production, another sign this is a timing-sensitive edge.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

    this.logger.log(`Discovered ${accounts.length} accounts across ${companyNames.length} company name(s)`);
    return accounts;
  }

  /**
   * Land on the account-detail page (where "Change account" search + the transaction
   * table live) via the Accounts list → first row click — the same navigation
   * discoverAccounts() Step 1-2 above does, extracted standalone for the PDF-only
   * retry path (runPdfExportOnly() in bank-sync.service.ts), which needs this exact
   * starting point WITHOUT running a full account discovery/sync. A fresh login (or
   * a reused session that happens to still be sitting on account-detail from a prior
   * run) both end up here; navigateToAccountAndApplyFilter() assumes it.
   */
  async navigateToAccountDetailPage(): Promise<void> {
    const page = this.requirePage();

    const alreadyThere = await page.$(SELECTORS.changeAccountInput);
    if (alreadyThere) return;

    this.logger.log(`[nav] Current URL before nav to account-detail: ${page.url()}`);
    await page.evaluate(() => { window.location.hash = '/accounts'; });
    await page.waitForURL(/#\/accounts/, { timeout: 15_000 }).catch(() => {});

    const firstRow = await page.waitForSelector('.table__row--clickable', { timeout: 10_000 }).catch(() => null);
    if (!firstRow) throw new Error('No clickable account rows found on the Accounts list page.');

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 20_000 }).catch(() => {}),
      firstRow.click(),
    ]);

    await page.waitForSelector(SELECTORS.changeAccountInput, { timeout: 20_000 });
  }

  // ─── Statement Download ─────────────────────────────────────────────────────

  /**
   * Switch to the given account via "Change account", apply date range filter,
   * and download the Excel export. Returns null if no transactions found.
   *
   * Thin wrapper over navigateToAccountAndApplyFilter() + exportExcel() — split out
   * so a retry whose Excel fetch already succeeded for this job (bank_sync step
   * already 'completed') can reuse just the navigate+filter half to reposition the
   * live page for PDF export, without re-downloading Excel it doesn't need again.
   * See bank-sync.service.ts's runPdfExportOnly().
   */
  async downloadStatement(
    accountNumber: string,
    dateFrom: Date,
    dateTo: Date,
    shouldCancel?: () => Promise<boolean>,
  ): Promise<Buffer | null> {
    const hasData = await this.navigateToAccountAndApplyFilter(accountNumber, dateFrom, dateTo, shouldCancel);
    if (!hasData) return null;
    return this.exportExcel(accountNumber, shouldCancel);
  }

  /**
   * Switch to `accountNumber` via "Change account" and apply the date range filter —
   * everything downloadStatement() needs BEFORE the actual Excel export click. Returns
   * false if HSBC reports no transactions for the range (caller should not attempt an
   * Excel export or a PDF scan in that case), true once the live table is positioned
   * and ready to read (whether for Excel export or exportTransactionPdfs() below).
   */
  async navigateToAccountAndApplyFilter(
    accountNumber: string,
    dateFrom: Date,
    dateTo: Date,
    shouldCancel?: () => Promise<boolean>,
  ): Promise<boolean> {
    const page = this.requirePage();

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
    let inputVisible = await page.waitForSelector(SELECTORS.changeAccountInput, { state: 'visible', timeout: 8_000 })
      .then(() => true).catch(() => false);
    if (!inputVisible) {
      // A stuck HSBC overlay left over from the PREVIOUS account — e.g. an Export
      // "preparing your file" panel that never resolved after that account's download
      // timed out — can hide this input without ever navigating away from the page.
      // Escape dismisses that class of transient overlay/dropdown without the
      // page.goto() reload deliberately avoided above. Cheap to try once before
      // failing outright, and confirmed against production logs: a download timeout
      // on one account was consistently followed by every subsequent account in the
      // same job failing here with the exact same stuck URL until this was added.
      this.logger.warn(`[${accountNumber}] changeAccountInput not visible on first check — attempting Escape recovery`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      inputVisible = await page.waitForSelector(SELECTORS.changeAccountInput, { state: 'visible', timeout: 5_000 })
        .then(() => true).catch(() => false);
    }
    if (!inputVisible) {
      // Escape alone wasn't enough — production logs show this happening too (URL
      // stuck on the SAME account for the rest of the job, Escape making no
      // difference), meaning whatever's blocking the input isn't a simple dismissible
      // dropdown. navigateToAccountDetailPage() re-enters via the Accounts list using
      // an in-SPA hash change (window.location.hash = '/accounts'), not a real
      // page.goto() reload — same mechanism the PDF-only retry path already relies on
      // to (re)land on account-detail, so it carries no more "LastLogin" popup risk
      // than that existing call site already does. Worth trying before failing the
      // rest of the job outright.
      this.logger.warn(`[${accountNumber}] Escape recovery didn't restore changeAccountInput — attempting full re-navigation via Accounts list`);
      await this.navigateToAccountDetailPage().catch((err) => {
        this.logger.warn(`[${accountNumber}] Re-navigation attempt failed — ${(err as Error).message.split('\n')[0]}`);
      });
      inputVisible = await page.waitForSelector(SELECTORS.changeAccountInput, { state: 'visible', timeout: 5_000 })
        .then(() => true).catch(() => false);
    }
    if (!inputVisible) {
      // Full technical detail → app log (console/CloudWatch). The thrown message is
      // what ends up in the user-facing job log, so keep it short and non-technical.
      // Snapshot the actual stuck page — every prior investigation of this exact
      // error required the user to manually reproduce it and inspect DevTools live;
      // capturing it here means the next occurrence is diagnosable from the files alone.
      const snapshot = await this.captureDebugSnapshot(page, `${accountNumber}-search-box-not-found`);
      this.logger.error(`[${accountNumber}] changeAccountInput not visible — URL: ${page.url()}, title: "${await page.title().catch(() => '')}"${snapshot ? `, ${snapshot}` : ''}`);
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

    // A transient "previous 365 days" retention message can briefly stand in for the
    // normal filter row right after switching accounts (see retentionErrorMessage's
    // comment) — wait it out first, same idea as the transactions-spinner wait later
    // in this function, since chasing the normal "Filter / search" flow while it's up
    // is what produces "Could not find the date range option" for an account that has
    // nothing actually wrong with it. Only acted on if it's actually showing — the
    // common case (message never appears) costs nothing beyond the 1s initial check.
    const retentionMsg = page.locator(SELECTORS.retentionErrorMessage);
    const retentionMsgShowing = await retentionMsg.waitFor({ state: 'visible', timeout: 1_000 }).then(() => true).catch(() => false);
    if (retentionMsgShowing) {
      this.logger.warn(`[${accountNumber}] "365 days" retention message showing right after account switch — waiting for it to clear`);
      const cleared = await retentionMsg.waitFor({ state: 'hidden', timeout: 15_000 }).then(() => true).catch(() => false);
      if (!cleared) {
        // Still up after a real wait — try the same recovery a human would: "Clear
        // all" sits right next to this message in the DOM (see the selector comment).
        this.logger.warn(`[${accountNumber}] Retention message still showing after 15s — trying "Clear all"`);
        await page.locator(SELECTORS.clearAllFiltersLink).filter({ hasText: 'Clear all' }).first().click({ force: true }).catch(() => {});
        await retentionMsg.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {});
      }
    }

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
    // Buffered, not written yet — see capturePreActionSnapshot()'s docstring. No live
    // evidence yet for this specific failure (unlike the chevron/spinner ones, both
    // nailed down this same way) — capture it so the next occurrence is diagnosable.
    const preFilterClickSnapshot = await this.capturePreActionSnapshot(page);
    // Retry-with-verification, same pattern as the Date range chevron below and the
    // Export button in exportExcel() — a single click + single wait previously gave
    // this step no second chance at all if the click landed a moment before HSBC's UI
    // was actually ready for it, unlike every other click in this flow.
    const filtersPanel = page.locator(SELECTORS.filtersPanel);
    let filtersPanelVisible = await filtersPanel.waitFor({ state: 'visible', timeout: 500 }).then(() => true).catch(() => false);
    for (let attempt = 1; attempt <= 3 && !filtersPanelVisible; attempt++) {
      await checkCancelled();
      const filterAlreadyOpen = await filterTrigger.getAttribute('aria-expanded').catch(() => null);
      if (filterAlreadyOpen !== 'true') {
        try {
          await filterTrigger.click({ timeout: 5_000, force: true });
        } catch (err) {
          this.logger.warn(`"Filter / search" trigger click failed (attempt ${attempt}/3) — ${(err as Error).message.split('\n')[0]}`);
        }
      }
      filtersPanelVisible = await filtersPanel.waitFor({ state: 'visible', timeout: 4_000 }).then(() => true).catch(() => false);
    }
    if (!filtersPanelVisible) {
      const [before, after] = await Promise.all([
        this.persistPreActionSnapshot(`${accountNumber}-before-filter-panel-click`, preFilterClickSnapshot),
        this.captureDebugSnapshot(page, `${accountNumber}-filter-panel-not-open`),
      ]);
      this.logger.error(`[${accountNumber}] "Filter / search" panel did not open — URL: ${page.url()}, before: [${before}], after: [${after}]`);
      throw new Error('Could not find the filter panel on the HSBC page.');
    }
    // Same class of gap the transactions-table spinner fix below addresses: the panel
    // CONTAINER being visible doesn't mean its contents (the chevron Step 3 is about to
    // click) have finished rendering/becoming interactive yet. Cheap settle wait before
    // the very first chevron attempt, on the same theory — give it a moment rather than
    // immediately racing a click against whatever's still mounting.
    await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});

    // ── Step 3: Open "Date range" (chevron scoped inside the filters panel) ───
    // "Date range" is the first field in the filter row (before Transaction type),
    // so the first chevron inside the panel belongs to it. Retries verify the real
    // outcome (the From field becoming visible) rather than trusting the click alone.
    const dateRangeChevron = filtersPanel.locator(SELECTORS.dateRangeChevron).first();
    const fromFieldLoc = page.locator(SELECTORS.dateFromInput);
    let panelOpen = await fromFieldLoc.waitFor({ state: 'visible', timeout: 500 }).then(() => true).catch(() => false);
    // Buffered, not written yet — see capturePreActionSnapshot()'s docstring. This
    // failure happens in isolation (doesn't cascade into later accounts the way the
    // Export-click stall did), so there's no live evidence yet for what's actually
    // blocking the chevron on the rare account/run where 3 attempts isn't enough —
    // capture it the same way so the next occurrence is diagnosable instead of guessed.
    const preChevronSnapshot = !panelOpen ? await this.capturePreActionSnapshot(page) : null;
    for (let attempt = 1; attempt <= 3 && !panelOpen; attempt++) {
      await checkCancelled();
      try {
        await dateRangeChevron.click({ timeout: 5_000, force: true });
      } catch (err) {
        this.logger.warn(`"Date range" chevron click failed (attempt ${attempt}/3) — ${(err as Error).message.split('\n')[0]}`);
      }
      panelOpen = await fromFieldLoc.waitFor({ state: 'visible', timeout: 4_000 }).then(() => true).catch(() => false);
    }
    if (!panelOpen) {
      const [before, after] = await Promise.all([
        preChevronSnapshot ? this.persistPreActionSnapshot(`${accountNumber}-before-date-range-chevron`, preChevronSnapshot) : Promise.resolve(''),
        this.captureDebugSnapshot(page, `${accountNumber}-date-range-not-open`),
      ]);
      this.logger.error(`[${accountNumber}] "Date range" did not open after 3 attempts — URL: ${page.url()}${before ? `, before: [${before}]` : ''}${after ? `, after: [${after}]` : ''}`);
      throw new Error('Could not find the date range option on the HSBC page.');
    }

    // ── Step 4: Fill in dates ─────────────────────────────────────────────────
    await this.fillDateRange(page, dateFrom, dateTo, shouldCancel);

    // ── Step 5: Wait for the auto-triggered search ────────────────────────────
    // Typing the "to" date fires HSBC's own search — no separate Apply click needed
    // (verified: the console script never clicks anything else and the table updates).
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    // networkidle above only means the NETWORK request(s) the date-range search fired
    // have settled — HSBC's own table can still be showing its loading spinner for a
    // bit after that (client-side re-render lagging the response). A debug snapshot
    // captured live in production caught this exact gap: the spinner was still up when
    // this function returned and the caller went straight into Export → Excel — the
    // export then hung until the 30/45s download timeout and left the page in a
    // permanently broken state for every account after it in the same job. Explicitly
    // wait for the spinner to clear (it may never have appeared at all for a fast
    // response, hence the short initial timeout) before treating the table as ready.
    await page.waitForSelector(SELECTORS.transactionsLoadingSpinner, { state: 'visible', timeout: 1_000 })
      .then(() => page.waitForSelector(SELECTORS.transactionsLoadingSpinner, { state: 'hidden', timeout: 20_000 }))
      .catch(() => {});

    // ── Step 6: Check for empty results ──────────────────────────────────────
    const noTxnEl = await page.$(SELECTORS.noTransactions);
    if (noTxnEl) {
      const msg = (await noTxnEl.textContent())?.trim() ?? 'No transactions';
      this.logger.log(`${accountNumber}: ${msg}`);
      return false;
    }

    return true;
  }

  /**
   * Click Export → Excel and download the file. Assumes the page is already sitting
   * on the right account's date-filtered table — call navigateToAccountAndApplyFilter()
   * first (downloadStatement() does both; a PDF-only retry pass calls just that half).
   */
  async exportExcel(accountNumber: string, shouldCancel?: () => Promise<boolean>): Promise<Buffer> {
    const page = this.requirePage();
    const ctx = this.requireContext();
    async function checkCancelled() {
      if (shouldCancel && await shouldCancel()) throw new Error('JOB_CANCELLED');
    }

    await checkCancelled();

    // ── Export → Excel ────────────────────────────────────────────────────────
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
    type PW = import('playwright').Page;

    // Track EVERY tab HSBC opens during this attempt, not just the one that ends up
    // carrying the download — ctx.once('page', ...) below only learns a new tab exists
    // once it actually fires 'download', so a tab that opens but then the download
    // never arrives (the 30s timeout below) was never closed: silently leaked for the
    // rest of the browser session. That leftover tab is the prime suspect behind
    // "account search box not found" cascades on later accounts in the same job after
    // one account's export times out — this ctx.on() catches it regardless of outcome.
    const openedPages: PW[] = [];
    const trackNewPage = (p: PW) => openedPages.push(p);
    ctx.on('page', trackNewPage);

    const downloadPromise = new Promise<DL>((resolve, reject) => {
      // Production logs show normal downloads (these are small, a few KB) completing
      // in 5-8s consistently — 45s is a safety margin for an off day, not an
      // expectation that HSBC is ever really this slow. A download that still hasn't
      // fired by then is genuinely stuck, not "almost done" — see the Escape recovery
      // in navigateToAccountAndApplyFilter() above for what actually handles that.
      const tid = setTimeout(() => reject(new Error('Download timeout 45s')), 45_000);
      const done = (dl: DL) => { clearTimeout(tid); resolve(dl); };
      page.once('download', done);                          // case: same tab
      ctx.once('page', (newPage) => newPage.once('download', done)); // case: new tab
    });

    // Buffered in memory, not written yet — see capturePreActionSnapshot()'s docstring.
    // Taken right before the click that can trigger a stuck download, so if it does
    // time out below we have BOTH what the page looked like right before things went
    // wrong AND right after, instead of only ever seeing the aftermath several
    // accounts later once the whole job has already cascaded.
    const preClickSnapshot = await this.capturePreActionSnapshot(page);

    try {
      await this.clickWithRetry(excelBtn, 'Excel export option', 3, 5_000, shouldCancel);
    } catch (err) {
      this.logger.error(`[${accountNumber}] Excel option click failed — ${(err as Error).message}`);
      throw new Error(`Could not find or click the Excel export option for ${accountNumber} on the HSBC page.`);
    }

    try {
      const download = await downloadPromise;
      const tmpPath = await download.path();
      if (!tmpPath) throw new Error(`Download path null for ${accountNumber}`);

      const buffer = await fs.promises.readFile(tmpPath);
      this.logger.log(`${accountNumber}: downloaded ${(buffer.length / 1024).toFixed(1)} KB`);
      return buffer;
    } catch (err) {
      if ((err as Error).message.startsWith('Download timeout')) {
        const [before, after] = await Promise.all([
          this.persistPreActionSnapshot(`${accountNumber}-before-export-click`, preClickSnapshot),
          this.captureDebugSnapshot(page, `${accountNumber}-download-timeout`),
        ]);
        this.logger.error(`[${accountNumber}] Download timed out — before click: [${before}], after timeout: [${after}]`);
      }
      throw err;
    } finally {
      ctx.off('page', trackNewPage);
      for (const p of openedPages) {
        if (p !== page && !p.isClosed()) await p.close().catch(() => {});
      }
    }
  }

  // ─── Transaction PDF export ─────────────────────────────────────────────────

  /**
   * Walk every page of the CURRENTLY DISPLAYED (already date-filtered) transaction
   * table for `accountNumber`, and for every row that has a "..." action button,
   * fetch its "Chi tiết giao dịch" PDF via HSBC's own detail popup — but only for
   * rows `shouldFetch` says are worth it (dedup decision lives in the DB, on the
   * caller's side, not here).
   *
   * Must be called right after downloadStatement() succeeds for this account, while
   * the page is still sitting on that account's filtered table — this method does
   * NOT re-select the account or re-apply the date filter itself.
   */
  async exportTransactionPdfs(
    accountNumber: string,
    shouldFetch: (key: PdfRowKey) => Promise<boolean>,
    onCaptured: (key: PdfRowKey, pdf: Buffer, fileName: string) => Promise<void>,
    shouldCancel?: () => Promise<boolean>,
  ): Promise<{ scanned: number; fetched: number; failed: number; errors: Array<{ reference: string; message: string }> }> {
    const page = this.requirePage();
    const ctx = this.requireContext();

    async function checkCancelled() {
      if (shouldCancel && await shouldCancel()) throw new Error('JOB_CANCELLED');
    }

    let scanned = 0;
    let fetched = 0;
    let failed = 0;
    let pageNum = 1;
    // Short, per-row failure reasons for the caller to surface into the job's visible
    // log (see bank-sync.service.ts's runPdfExportForAccount) — full Playwright detail
    // still goes to this.logger.error() below (console/CloudWatch only), same split
    // as downloadStatement() elsewhere in this file: technical trace → app log,
    // short first-line message → what the user actually sees.
    const errors: Array<{ reference: string; message: string }> = [];

    for (;;) {
      await checkCancelled();

      // Snapshot id + aria-label up front for every row action button currently on
      // screen — re-querying a fresh Locator by id at click time below (not reusing
      // a handle from here) is what actually protects against the table re-rendering
      // between rows (e.g. after closing a modal).
      //
      // offsetParent !== null is a cheap "actually laid out and rendered" check (false
      // for display:none and detached nodes) — belt-and-suspenders on top of the
      // .account-transactions-table scope above against matching a leftover element
      // HSBC's SPA didn't clean up when switching accounts.
      const scanRows = () => page.locator(SELECTORS.rowActionBtn).evaluateAll((els) =>
        els
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => ({ id: el.id, ariaLabel: el.getAttribute('aria-label') ?? '' })),
      );
      let rows = await scanRows();

      // On the very first page, 0 rows is ambiguous — either this table genuinely has
      // none, or the table just hasn't finished rendering the "..." buttons yet. Matters
      // specifically for the PDF-only retry path (runPdfExportOnly() in
      // bank-sync.service.ts): it jumps straight from navigateToAccountAndApplyFilter()
      // into this scan with no interleaved Excel download beforehand to naturally
      // absorb render time the way a normal bank_sync run does — observed live
      // returning 0 rows on the first pass for a table that clearly had buttons
      // moments later on manual inspection. Retry a few times, re-querying the real
      // DOM each time, before accepting "0 rows" as final.
      if (pageNum === 1 && rows.length === 0) {
        for (let attempt = 1; attempt <= 4 && rows.length === 0; attempt++) {
          await page.waitForTimeout(1_500);
          rows = await scanRows();
        }
      }

      for (const row of rows) {
        await checkCancelled();

        const match = ROW_REFERENCE_RE.exec(row.ariaLabel);
        if (!match) {
          this.logger.warn(`[${accountNumber}] Could not parse reference from action button aria-label: "${row.ariaLabel}"`);
          continue;
        }
        const key: PdfRowKey = { reference: match[1].trim(), dateTimeLabel: match[2].trim() };

        // `scanned` counts only rows we actually decided to attempt (shouldFetch
        // returned true) — NOT every row visible on the page. The table normally
        // shows rows from many days/pages beyond whatever this sync run stored, so
        // most rows legitimately have no matching BankTransaction; that's expected,
        // not something worth counting toward this account's PDF scan total. See
        // bank-sync.service.ts's runPdfExportForAccount for the shouldFetch/unmatched
        // split this feeds into.
        if (!(await shouldFetch(key))) continue;
        scanned++;

        try {
          // NOT /_(\w+)$/ — \w includes underscore, so that pattern greedily matches
          // from the FIRST underscore ("transaction_action_button_15" -> captures
          // "action_button_15" instead of "15"), producing a dropdown selector that can
          // never match anything real. [^_]+ forces matching only the LAST underscore-
          // delimited segment. Confirmed via a standalone mock-hsbc test: this alone
          // reproduced every "Action menu did not open" failure seen in production,
          // independent of the earlier stale-button/hover fixes.
          const idxMatch = /_([^_]+)$/.exec(row.id);
          if (!idxMatch) throw new Error(`Unexpected action button id format: "${row.id}"`);
          const suffix = idxMatch[1];

          // Retry-with-verification, same pattern as the Export button / Date range
          // chevron in downloadStatement() above — a single click + single waitFor was
          // observed to time out consistently in production (locator.waitFor: Timeout
          // 5000ms exceeded) even though DevTools confirms the dropdown's real id/class
          // match exactly. Checking the actual outcome (dropdown visible) between
          // attempts, rather than trusting one click, is what those two call sites
          // needed for this exact class of flakiness on this same HSBC UI.
          const rowBtn = page.locator(`#${row.id}`);
          const dropdown = page.locator(SELECTORS.rowActionDropdown(suffix));
          // The "..." button is almost certainly opacity:0-until-hover, same convention
          // this app's own MoreMenu buttons use (tr:hover .moreBtn) — a very common
          // hover-reveal row-action pattern. force:true click bypasses Playwright's own
          // actionability checks and dispatches a raw click at the element's bounding
          // box, but that alone never fires the mouseenter/mouseover events a real mouse
          // movement would — if HSBC's own JS only wires up (or CSS only reveals) the
          // button on hover, a click with no prior hover can silently land on nothing.
          // Real .hover() dispatches genuine mouse-move events first.
          await rowBtn.hover({ force: true }).catch(() => {});
          let dropdownOpen = false;
          for (let attempt = 1; attempt <= 3 && !dropdownOpen; attempt++) {
            await checkCancelled();
            try {
              await rowBtn.hover({ force: true }).catch(() => {});
              await rowBtn.click({ timeout: 5_000, force: true });
            } catch (err) {
              this.logger.warn(`[${accountNumber}] "..." button click failed (attempt ${attempt}/3) — ${(err as Error).message.split('\n')[0]}`);
            }
            dropdownOpen = await dropdown.waitFor({ state: 'visible', timeout: 2_500 }).then(() => true).catch(() => false);
          }
          if (!dropdownOpen) {
            throw new Error(`Action menu did not open after 3 attempts (button #${row.id})`);
          }

          // Same language-dependent-label issue as ROW_REFERENCE_RE above — an
          // English-profile HSBCnet session renders this dropdown item as "View
          // transaction details" instead of the Vietnamese text, confirmed live via
          // DevTools. Match either.
          const detailOption = dropdown.getByText(/Xem chi tiết giao dịch|View transaction details/).first();
          const modal = page.locator(SELECTORS.detailModal);
          let modalOpen = false;
          for (let attempt = 1; attempt <= 3 && !modalOpen; attempt++) {
            await checkCancelled();
            try {
              await detailOption.click({ timeout: 5_000, force: true });
            } catch (err) {
              this.logger.warn(`[${accountNumber}] "Xem chi tiết giao dịch" click failed (attempt ${attempt}/3) — ${(err as Error).message.split('\n')[0]}`);
            }
            modalOpen = await modal.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false);
          }
          if (!modalOpen) {
            throw new Error('Detail popup did not open after 3 attempts');
          }

          // Set up the PDF listener BEFORE clicking — same race-avoidance reasoning as
          // the Excel download in downloadStatement() above. Two distinct outcomes are
          // possible here depending on Chrome's PDF-viewer availability: headed Chrome
          // renders the PDF in a new tab (a plain 'response' with content-type
          // application/pdf), while headless Chrome has no PDF viewer and instead
          // triggers an actual file 'download' (same tab or new tab) — confirmed via
          // production: identical flow, headless:false → response; headless:true →
          // download, every single row. Racing both, like downloadStatement() already
          // does for Excel, makes this robust across both.
          type Resp = import('playwright').Response;
          type PW = import('playwright').Page;
          type DL = import('playwright').Download;
          type PdfCapture = { kind: 'response'; resp: Resp; newPage: PW } | { kind: 'download'; download: DL };

          // Same leak as exportExcel() above: ctx.once('page', ...) inside pdfPromise only
          // learns a new tab exists once it actually delivers, so a tab HSBC opens right
          // before the 20s timeout fires below was never closed — orphaned for the rest of
          // the browser session, and a likely trigger for "account search box not found" on
          // later rows/accounts. Track every tab opened during this attempt and sweep up
          // anything left over in the finally below, regardless of outcome.
          const openedPages: PW[] = [];
          const trackNewPage = (p: PW) => openedPages.push(p);
          ctx.on('page', trackNewPage);

          const pdfPromise = new Promise<PdfCapture>((resolve, reject) => {
            const tid = setTimeout(() => reject(new Error('PDF response timeout 20s')), 20_000);
            const resolveOnce = (val: PdfCapture) => { clearTimeout(tid); resolve(val); };
            page.once('download', (dl) => resolveOnce({ kind: 'download', download: dl })); // case: same tab
            ctx.once('page', (newPage) => {
              newPage.once('download', (dl) => resolveOnce({ kind: 'download', download: dl })); // case: new tab
              newPage.on('response', (resp) => {
                const contentType = resp.headers()['content-type'] ?? '';
                if (contentType.includes('application/pdf')) resolveOnce({ kind: 'response', resp, newPage });
              });
            });
          });

          try {
            await modal.locator(SELECTORS.detailPdfBtn).click();
            const capture = await pdfPromise;

            let buffer: Buffer;
            let fileName: string;
            if (capture.kind === 'download') {
              const tmpPath = await capture.download.path();
              if (!tmpPath) throw new Error('PDF download path was null');
              buffer = await fs.promises.readFile(tmpPath);
              fileName = capture.download.suggestedFilename() || 'transaction.pdf';
            } else {
              buffer = await capture.resp.body();
              fileName = extractPdfFileName(capture.resp) ?? await capture.newPage.title().catch(() => 'transaction.pdf');
            }

            await modal.locator(SELECTORS.detailCloseBtn).click().catch(() => {});

            await onCaptured(key, buffer, fileName);
            fetched++;
          } finally {
            ctx.off('page', trackNewPage);
            for (const p of openedPages) {
              if (p !== page && !p.isClosed()) await p.close().catch(() => {});
            }
          }
        } catch (err) {
          failed++;
          const fullMsg = (err as Error).message ?? 'Unknown error';
          this.logger.error(`[${accountNumber}] PDF export failed for "${key.reference}" — ${fullMsg}`);
          // First line only — Playwright errors often carry a multi-line actionability
          // call log (dozens of lines) that's useful in the app log above but meaningless
          // noise in the job's user-facing technical details.
          errors.push({ reference: key.reference, message: fullMsg.split('\n')[0] });
          // Best-effort cleanup — a failure on one row (e.g. PDF response timeout)
          // must not leave the modal open and block every row after it on this page.
          await page.locator(SELECTORS.detailCloseBtn).click({ timeout: 2_000 }).catch(() => {});
          await page.keyboard.press('Escape').catch(() => {});
        }
      }

      const nextBtn = page.locator(SELECTORS.paginationNextBtn);
      if (await nextBtn.count() === 0) break; // single page — no pagination control at all
      const nextDisabled = await nextBtn.getAttribute('aria-disabled').catch(() => 'true');
      if (nextDisabled === 'true') break; // last page

      await nextBtn.click({ force: true });
      await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
      pageNum++;
      // Safety valve — a selector/layout regression that made aria-disabled never
      // read "true" would otherwise loop forever instead of failing loudly.
      if (pageNum > 200) {
        this.logger.warn(`[${accountNumber}] PDF export pagination exceeded 200 pages — stopping (selector may be broken).`);
        break;
      }
    }

    return { scanned, fetched, failed, errors };
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

/**
 * Best-effort filename for a captured PDF response — tries Content-Disposition first
 * (what a real "inline; filename=..." response sends), then the URL's own path segment.
 * Returns null if neither yields anything usable, letting the caller fall back to the
 * new tab's document title (real HSBC's AITRANPRINT... filename is also its page title).
 */
function extractPdfFileName(resp: import('playwright').Response): string | null {
  const disposition = resp.headers()['content-disposition'];
  if (disposition) {
    const match = /filename="?([^";]+)"?/i.exec(disposition);
    if (match?.[1]) return match[1];
  }
  try {
    const last = new URL(resp.url()).pathname.split('/').filter(Boolean).pop();
    if (last && last.length > 0) return decodeURIComponent(last);
  } catch {
    // fall through
  }
  return null;
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
