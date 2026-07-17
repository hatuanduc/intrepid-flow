// Standalone diagnostic script — mirrors the CURRENT fixed logic in playwright.service.ts
// (panel-open loop w/ chevron fallback, fillAndVerify, Export-dropdown toggle-verify loop)
// so we can watch it run live against the real HSBC page and see exactly where it breaks.
// Does NOT touch playwright.service.ts. Run from apps/worker: npx tsx scratch-test-datefill.ts
// Temporary — delete after use.
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { HSBCNET_URL, SESSION_FILE } from './src/bank-sync/constants';

const SELECTORS = {
  dashboardEl: 'button.page-header__log-off',
  changeAccountInput: 'input[aria-label*="account number or title"]',
  specifyDateRange: 'span#showing_actual_range_quick_link',
  dateFromInput: '#dateFieldFrom-field',
  dateToInput: '#dateFieldTo-field',
  dateRangeChevron: '[data-testid="ChevronDownIcon"]',
  exportTrigger: 'button#export-dropdown-trigger',
  excelOption: '.user-action__drop-option--clickable',
};

function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, () => { rl.close(); resolve(); }));
}

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

async function fillAndVerify(locator: import('playwright').Locator, value: string, label: string, attempts = 3): Promise<void> {
  let lastActual = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    console.log(`  [${label}] attempt ${attempt}/${attempts}: click + fill "${value}"`);
    await locator.click();
    await locator.click({ clickCount: 3 });
    await locator.fill(value);
    lastActual = await locator.inputValue().catch(() => '');
    console.log(`  [${label}] value after fill: "${lastActual}"`);
    if (lastActual === value) return;
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`Could not fill "${label}" — value stayed "${lastActual}" instead of "${value}" after ${attempts} attempts.`);
}

async function main() {
  const { chromium } = await import('playwright');
  const sessionPath = path.join(process.cwd(), SESSION_FILE);
  const storageState = fs.existsSync(sessionPath) ? sessionPath : undefined;
  console.log(storageState ? `Loaded saved session from ${sessionPath}` : 'No saved session found.');

  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext(storageState ? { storageState } : {});
  const page = await context.newPage();

  await page.goto(HSBCNET_URL, { waitUntil: 'load', timeout: 30_000 });

  const loggedIn = await page.waitForSelector(SELECTORS.dashboardEl, { timeout: 5_000 }).then(() => true).catch(() => false);
  if (!loggedIn) {
    await waitForEnter('Not logged in. Log in manually, then press Enter here to continue...\n');
  }

  await page.evaluate(() => { window.location.hash = '/accounts'; });
  await page.waitForURL(/#\/accounts/, { timeout: 15_000 }).catch(() => {});
  const firstRow = await page.waitForSelector('.table__row--clickable', { timeout: 10_000 }).catch(() => null);
  if (!firstRow) {
    console.error('No account row found.');
    await waitForEnter('Press Enter to close...\n');
    await browser.close();
    return;
  }
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load', timeout: 20_000 }).catch(() => {}),
    firstRow.click(),
  ]);
  console.log(`On account detail page — URL: ${page.url()}`);

  // ── Step: open the date range panel (mirrors the fixed loop — click, verify, chevron fallback) ──
  const specifyLink = page.locator(SELECTORS.specifyDateRange);
  const fromFieldLoc = page.locator(SELECTORS.dateFromInput);
  const chevronLoc = page.locator('div', { hasText: 'Date range' }).locator(SELECTORS.dateRangeChevron).last();

  let panelOpen = false;
  for (let attempt = 1; attempt <= 4 && !panelOpen; attempt++) {
    try {
      if (attempt <= 2) {
        console.log(`Attempt ${attempt}: clicking "Specify date range"`);
        await specifyLink.click({ timeout: 5_000 });
      } else {
        console.log(`Attempt ${attempt}: clicking chevron fallback`);
        await chevronLoc.click({ timeout: 5_000 });
      }
    } catch (err) {
      console.warn(`  click failed: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
    }
    panelOpen = await fromFieldLoc.waitFor({ state: 'visible', timeout: 2_500 }).then(() => true).catch(() => false);
    console.log(`  panel open? ${panelOpen}`);
  }
  if (!panelOpen) {
    console.error('Panel did not open after 4 attempts. Stopping here — inspect the page.');
    await waitForEnter('Press Enter to close...\n');
    await browser.close();
    return;
  }

  // ── Step: fill dates (using today+yesterday as test values, matching the fix) ──
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const fromStr = formatDate(yesterday);
  const toStr = formatDate(today);

  const fromInput = page.locator(SELECTORS.dateFromInput);
  const toInput = page.locator(SELECTORS.dateToInput);
  try {
    await fillAndVerify(fromInput, fromStr, 'Date from');
    await fillAndVerify(toInput, toStr, 'Date to');
    console.log('Both date fields filled successfully.');
  } catch (err) {
    console.error('DATE FILL FAILED:', err instanceof Error ? err.message : err);
    await waitForEnter('Press Enter to close...\n');
    await browser.close();
    return;
  }

  console.log('Waiting for auto-search / networkidle...');
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

  // ── Step: open Export dropdown (mirrors the fixed toggle-verify loop) ──
  const exportTriggerLoc = page.locator(SELECTORS.exportTrigger);
  const excelBtn = page.locator(SELECTORS.excelOption).filter({ hasText: 'Excel' }).first();
  let exportOpen = false;
  for (let attempt = 1; attempt <= 3 && !exportOpen; attempt++) {
    try {
      console.log(`Export attempt ${attempt}/3: clicking Export trigger`);
      await exportTriggerLoc.click({ timeout: 5_000 });
    } catch (err) {
      console.warn(`  Export click failed: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
    }
    exportOpen = await excelBtn.waitFor({ state: 'visible', timeout: 2_500 }).then(() => true).catch(() => false);
    console.log(`  Excel option visible? ${exportOpen}`);
  }
  if (!exportOpen) {
    const disabled = await exportTriggerLoc.getAttribute('disabled').catch(() => null);
    const ariaExpanded = await exportTriggerLoc.getAttribute('aria-expanded').catch(() => null);
    console.error(`Export dropdown did not open after 3 attempts. disabled="${disabled}" aria-expanded="${ariaExpanded}"`);
    await waitForEnter('Press Enter to close...\n');
    await browser.close();
    return;
  }

  console.log('SUCCESS: Export dropdown opened, Excel option is visible. (Not clicking Excel — this is a dry run, no download triggered.)');
  console.log('\nBrowser stays open — inspect visually, then press Enter here to close.');
  await waitForEnter('');
  await browser.close();
}

main().catch(err => {
  console.error('ERROR:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
