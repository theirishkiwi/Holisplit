// Drive the app the way a person does: tap, type, read the screen. Only the page's buttons, fields and text are used,
// never its internal code, so these tests keep working however the code inside is organised.
import { chromium } from 'playwright';

export async function launch() {
  return chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
}

// a phone: its own storage, like a separate device
export async function phone(browser, url, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ...opts });
  // only the local test server: web fonts and anything else outside fail fast, so runs are quick and the same everywhere
  const origin = new URL(url).origin;
  await ctx.route('**/*', r => r.request().url().startsWith(origin) ? r.continue() : r.abort());
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await ready(page);
  return { ctx, page };
}

// the app has started: the trip name is filled in and the first sync check has run
export async function ready(page) {
  await page.locator('#trip').waitFor();
  await until(async () => (await page.inputValue('#trip')) !== '' && (await page.getAttribute('#cloud', 'data-s')) !== null, 'app ready');
}
export const text = async (page, sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
export async function until(fn, what = 'condition', ms = 5000) {
  const end = Date.now() + ms; let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e; } await new Promise(r => setTimeout(r, 50)); }
  throw new Error(`Timed out waiting for ${what}` + (last instanceof Error ? `: ${last.message}` : ''));
}
export const tab = (page, name) => page.click(`.tabs [data-tab="${{ Expenses: 'exp', 'Settle up': 'bal', Group: 'ppl' }[name]}"]`);
export const closeSheet = async page => { await page.locator('#scrim [data-dismiss], #scrim #sclose').first().click(); await page.locator('#scrim .sheet').waitFor({ state: 'detached' }); };
// changes are sent about half a second after the last edit; wait for that send to finish
export async function synced(page) {
  await new Promise(r => setTimeout(r, 900));
  await until(async () => (await page.getAttribute('#cloud', 'data-s')) === 'ok', 'sync');
}
// a person's row in Group, by their exact name
export const personRow = (page, name) => page.locator('[data-person]').filter({ has: page.locator('.t', { hasText: new RegExp(`^${name}$`) }) });

// a fresh trip: name, currency, people, and who this phone is
export async function newTrip(page, { name = 'Tuscany', cur = '€', people = ['Chris', 'Leanne', 'Sara'], me = people[0] } = {}) {
  if (await page.locator('#clearSample').isVisible()) await page.click('#clearSample');
  await page.fill('#trip', name); await page.press('#trip', 'Tab');
  await page.click('#gear'); await page.fill('#scur', cur); await page.press('#scur', 'Tab'); await closeSheet(page);
  await tab(page, 'Group');
  for (const n of people) { await page.fill('#pname', n); await page.press('#pname', 'Enter'); }
  await tab(page, 'Expenses');
  if (me) await page.click(`.mecard [data-me][aria-label="${me}"]`);
}

// add an expense through the form; split defaults to everyone
export async function addExpense(page, { amount, desc, paidBy, split, cc, date }) {
  await page.click('#add');
  if (cc) { await page.click('#ccbtn'); await page.click(`[data-cc="${cc}"]`); }
  await page.fill('#famt', String(amount));
  if (desc) await page.fill('#fdesc', desc);
  if (date) { await page.fill('#fdate', date); await page.dispatchEvent('#fdate', 'input'); }
  if (paidBy) await page.click(`#paidChips [aria-label="${paidBy}"]`);
  if (split) for (const b of await page.locator('#forChips [data-for]').all()) {
    const want = split.includes(await b.getAttribute('aria-label')), on = (await b.getAttribute('aria-pressed')) === 'true';
    if (want !== on) await b.click();
  }
  await page.click('#eform button.primary');
}

// the trip link from the Group tab's WhatsApp invite
export async function inviteLink(page) {
  await tab(page, 'Group');
  const href = await page.getAttribute('.invite a.wa', 'href');
  await tab(page, 'Expenses');
  return decodeURIComponent(href.split('text=')[1]).match(/https?:\/\/\S+/)[0];
}

// all rows on Settle up, as plain text
export async function settleRows(page) {
  await tab(page, 'Settle up');
  const fold = page.locator('[data-fold="othersOpen"][aria-expanded="false"]');
  if (await fold.count()) await fold.click();
  return (await page.locator('.srow').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
}
