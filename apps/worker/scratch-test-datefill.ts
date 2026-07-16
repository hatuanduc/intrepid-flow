// Standalone, read-only diagnostic script — does NOT touch playwright.service.ts.
// Purpose: find out whether `.fill()` or `.pressSequentially()` (real keystroke simulation)
// is what actually makes HSBC's "Date from" masked input accept a value programmatically.
// Reuses the same saved session file the real worker uses, so it should already be logged in.
// Run from apps/worker: npx tsx scratch-test-datefill.ts
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
};

function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, () => { rl.close(); resolve(); }));
}

async function main() {
  const { chromium } = await import('playwright');
  const sessionPath = path.join(process.cwd(), SESSION_FILE);
  const storageState = fs.existsSync(sessionPath) ? sessionPath : undefined;
  console.log(storageState ? `Loaded saved session from ${sessionPath}` : 'No saved session found — you may need to log in manually.');

  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext(storageState ? { storageState } : {});
  const page = await context.newPage();

  await page.goto(HSBCNET_URL, { waitUntil: 'load', timeout: 30_000 });

  const loggedIn = await page.waitForSelector(SELECTORS.dashboardEl, { timeout: 5_000 }).then(() => true).catch(() => false);
  if (!loggedIn) {
    await waitForEnter('Not logged in. Please log in manually in the opened browser window, then press Enter here to continue...\n');
  }

  // Navigate to accounts and open the first one (same trick as discoverAccounts()).
  await page.evaluate(() => { window.location.hash = '/accounts'; });
  await page.waitForURL(/#\/accounts/, { timeout: 15_000 }).catch(() => {});
  const firstRow = await page.waitForSelector('.table__row--clickable', { timeout: 10_000 }).catch(() => null);
  if (!firstRow) {
    console.error('No account row found — is the accounts page showing correctly?');
    await waitForEnter('Press Enter to close...\n');
    await browser.close();
    return;
  }
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load', timeout: 20_000 }).catch(() => {}),
    firstRow.click(),
  ]);
  console.log(`On account detail page — URL: ${page.url()}`);

  // Open the date range picker.
  const specifyLink = await page.waitForSelector(SELECTORS.specifyDateRange, { timeout: 10_000 }).catch(() => null);
  if (!specifyLink) {
    console.error('"Specify date range" link not found.');
    await waitForEnter('Press Enter to close...\n');
    await browser.close();
    return;
  }
  await specifyLink.click();
  await page.waitForTimeout(500);

  const fromInput = page.locator(SELECTORS.dateFromInput);
  await fromInput.waitFor({ state: 'visible', timeout: 6_000 });

  const baseline = await fromInput.inputValue().catch(() => '(could not read)');
  console.log(`\nBaseline value before any test (likely a stale/saved default): "${baseline}"`);

  // ── Test A: .fill() ──────────────────────────────────────────────────────
  const testValueA = '02/02/2024';
  await fromInput.click({ clickCount: 3 });
  await fromInput.fill(testValueA);
  await page.waitForTimeout(300);
  const resultA = await fromInput.inputValue().catch(() => '(could not read)');
  console.log(`\n[Test A] .fill("${testValueA}") → field now shows: "${resultA}" → ${resultA === testValueA ? 'PASS' : 'FAIL'}`);

  // ── Test B: .pressSequentially() (real keystroke simulation) ─────────────
  const testValueB = '03/03/2024';
  await fromInput.click({ clickCount: 3 });
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await fromInput.pressSequentially(testValueB, { delay: 60 });
  await page.waitForTimeout(300);
  const resultB = await fromInput.inputValue().catch(() => '(could not read)');
  console.log(`\n[Test B] .pressSequentially("${testValueB}") → field now shows: "${resultB}" → ${resultB === testValueB ? 'PASS' : 'FAIL'}`);

  console.log('\nDone. Browser stays open — inspect the field visually, then press Enter here to close it.');
  await waitForEnter('');
  await browser.close();
}

main().catch(err => {
  console.error('ERROR:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
