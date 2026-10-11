// Safety-net tests: the main things a group does, in a real browser against the real server code.
// They only use what's on screen, so they must pass unchanged before and after the code is reorganised.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { launch, ready, personRow, phone, newTrip, addExpense, tab, text, until, synced, inviteLink, settleRows, closeSheet } from './helpers.mjs';

const RECEIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'receipt.jpg');
let server, browser;
test.before(async () => { server = await startServer(); browser = await launch(); });
test.after(async () => { await browser?.close(); await server?.close(); });
const noErrors = page => assert.deepEqual(page.errors, [], 'no script errors');

test('new trip: add people and an expense, see who owes whom, edit it, delete it and undo', { timeout: 60000 }, async () => {
  const { ctx, page } = await phone(browser, server.url);
  try {
    await newTrip(page, { name: 'Tuscany', cur: '€', people: ['Chris', 'Leanne', 'Sara'], me: 'Chris' });
    await addExpense(page, { amount: 90, desc: 'Dinner', paidBy: 'Chris' });
    const row = page.locator('.row', { hasText: 'Dinner' });
    assert.match(await row.innerText(), /€90\.00[\s\S]*you're owed €60\.00/);
    const rows = await settleRows(page);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(r => / You €30\.00/.test(r)), rows.join(' | '));       // "Leanne → You €30.00" (the arrow is an icon)
    await tab(page, 'Expenses');
    await page.locator('.row', { hasText: 'Dinner' }).click();
    await page.fill('#famt', '60'); await page.click('#eform button.primary');
    assert.match(await page.locator('.row', { hasText: 'Dinner' }).innerText(), /€60\.00[\s\S]*you're owed €40\.00/);
    await page.locator('.row', { hasText: 'Dinner' }).click();
    await page.click('#del');
    await until(async () => !(await page.locator('.row', { hasText: 'Dinner' }).count()), 'expense removed');
    await page.click('.toast button');                                   // Undo
    await until(() => page.locator('.row', { hasText: 'Dinner' }).count(), 'undo restores it');
    noErrors(page);
  } finally { await ctx.close(); }
});

test('two phones share a trip through the invite link, see each other\'s expenses, and the server can\'t read them', { timeout: 60000 }, async () => {
  const A = await phone(browser, server.url);
  try {
    await newTrip(A.page, { name: 'Lisbon', cur: '€', people: ['Chris', 'Leanne'], me: 'Chris' });
    await addExpense(A.page, { amount: 40, desc: 'Sardines', paidBy: 'Chris' });
    await synced(A.page);
    const link = await inviteLink(A.page);
    const B = await phone(browser, link);
    try {
      await until(async () => (await B.page.inputValue('#trip')) === 'Lisbon', 'trip opens on the second phone');
      assert.match(await text(B.page, '#exp'), /Sardines/);
      await B.page.click('.mecard [data-me][aria-label="Leanne"]');
      await addExpense(B.page, { amount: 30, desc: 'Taxi', paidBy: 'Leanne' });
      await synced(B.page);
      await A.page.reload(); await ready(A.page);
      await until(async () => /Taxi/.test(await text(A.page, '#exp')), 'Taxi reaches the first phone');
      const stored = [...server.env.TRIPS.m.values()].filter(v => typeof v === 'string').join(' ');
      assert.ok(!/Sardines|Taxi|Leanne|Lisbon/.test(stored), 'server only holds encrypted data');
      noErrors(A.page); noErrors(B.page);
    } finally { await B.ctx.close(); }
  } finally { await A.ctx.close(); }
});

test('a joint-account couple is shown together and settles as one', { timeout: 60000 }, async () => {
  const { ctx, page } = await phone(browser, server.url);
  try {
    await newTrip(page, { name: 'Tuscany', cur: '€', people: ['Chris', 'Leanne', 'David', 'Sarah'], me: 'Chris' });
    await tab(page, 'Group');
    await personRow(page, 'Chris').click();
    await page.click('[data-pairto][aria-label="Leanne"]');
    await personRow(page, 'Chris').click();
    await page.check('#pjoint');
    await closeSheet(page);
    assert.match(await personRow(page, 'Leanne').innerText(), /Couple with Chris · joint account/);
    await tab(page, 'Expenses');
    await addExpense(page, { amount: 200, desc: 'Pizza', paidBy: 'Leanne' });
    assert.match(await page.locator('.row', { hasText: 'Pizza' }).innerText(), /you're owed €100\.00/);
    const rows = await settleRows(page);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(r => /You & Leanne\*/.test(r) && /€50\.00/.test(r)), rows.join(' | '));
    assert.match(await text(page, '.cnote'), /Couples settle up as one/);
    noErrors(page);
  } finally { await ctx.close(); }
});

test('settling up: record a payment, the debt clears, Undo brings it back', { timeout: 60000 }, async () => {
  const { ctx, page } = await phone(browser, server.url);
  try {
    await newTrip(page, { name: 'Tuscany', cur: '€', people: ['Chris', 'Sara'], me: 'Chris' });
    await addExpense(page, { amount: 50, desc: 'Boat', paidBy: 'Chris' });
    await tab(page, 'Settle up');
    await page.click('.srow [data-settle]');
    assert.equal(await page.inputValue('#pamt'), '25.00');
    await page.click('#pform2 button.primary');
    assert.match(await text(page, '#bal'), /Everyone is square/);
    await page.click('.toast button');                                   // Undo
    await until(async () => (await page.locator('.srow').count()) === 1, 'debt back after Undo');
    noErrors(page);
  } finally { await ctx.close(); }
});

test('settle in £ on a € trip: the live rate is filled in and amounts show in £', { timeout: 60000 }, async () => {
  const { ctx, page } = await phone(browser, server.url);
  try {
    await newTrip(page, { name: 'Tuscany', cur: '€', people: ['Chris', 'Sara'], me: 'Sara' });
    await addExpense(page, { amount: 60, desc: 'Villa', paidBy: 'Chris' });
    await tab(page, 'Settle up');
    await page.click('#sxBtn');
    await page.click('[data-sxcc="£"]');
    await until(async () => (await page.inputValue('#sxrate')) === '0.8476', 'live rate');
    await page.click('#sxform button.primary');
    assert.match(await text(page, '#sxBtn'), /Settle in £ · €1 = £0\.8476/);
    assert.match(await text(page, '.srow'), /£25\.43/);                 // €30 × 0.8476
    noErrors(page);
  } finally { await ctx.close(); }
});

test('an expense in another currency gets the day\'s rate, and switching currency converts it', { timeout: 60000 }, async () => {
  const { ctx, page } = await phone(browser, server.url);
  try {
    await newTrip(page, { name: 'Weekend', cur: '£', people: ['Chris', 'Leanne'], me: 'Chris' });
    await page.click('#add');
    await page.click('#ccbtn'); await page.click('[data-cc="€"]');
    await until(async () => (await page.inputValue('#frate')) === '0.8476', 'rate for the day');
    assert.match(await text(page, '#rnote'), /Rate for .* from Frankfurter/);
    await page.fill('#famt', '56.30'); await page.fill('#fdesc', 'Cafe');
    assert.equal(await text(page, '#conv'), '= £47.72');
    await page.click('#eform button.primary');
    await page.locator('.row', { hasText: 'Cafe' }).click();
    await page.click('#ccbtn'); await page.click('[data-cc="£"]');
    await until(async () => (await page.inputValue('#famt')) === '47.72', 'converted to £');
    assert.match(await text(page, '#cvnote'), /Converted from €56\.30\. Keep 56\.30 instead/);
    noErrors(page);
  } finally { await ctx.close(); }
});

test('offline: a clear banner, expenses still work, and they sync when signal returns', { timeout: 60000 }, async () => {
  const A = await phone(browser, server.url);
  try {
    await newTrip(A.page, { name: 'Lakes', cur: '£', people: ['Chris', 'Leanne'], me: 'Chris' });
    await synced(A.page);
    const link = await inviteLink(A.page);
    await A.ctx.setOffline(true);
    await until(() => A.page.locator('#offline').isVisible(), 'offline banner');
    await addExpense(A.page, { amount: 12, desc: 'Ice creams', paidBy: 'Chris' });
    await until(async () => /saved on this phone/.test(await text(A.page, '#offText')), 'changes waiting');
    await A.ctx.setOffline(false);
    await until(async () => !(await A.page.locator('#offline').isVisible()), 'banner goes when back online');
    await synced(A.page);
    const B = await phone(browser, link);
    try { await until(async () => /Ice creams/.test(await text(B.page, '#exp')), 'synced to another phone'); }
    finally { await B.ctx.close(); }
    noErrors(A.page);
  } finally { await A.ctx.close(); }
});

test('the duplicate check asks before adding the same expense twice', { timeout: 60000 }, async () => {
  const { ctx, page } = await phone(browser, server.url);
  try {
    await newTrip(page, { name: 'Tuscany', cur: '€', people: ['Chris', 'Leanne'], me: 'Chris' });
    await addExpense(page, { amount: 33, desc: 'Eurospin', paidBy: 'Chris' });
    await addExpense(page, { amount: 33, desc: 'Eurospin', paidBy: 'Leanne' });
    await until(() => page.locator('#duppanel').isVisible(), 'duplicate prompt');
    assert.match(await text(page, '#duppanel'), /Possible duplicate/);
    await page.click('#dupNo');
    assert.equal(await page.locator('.row', { hasText: 'Eurospin' }).count(), 1);
    noErrors(page);
  } finally { await ctx.close(); }
});

test('a receipt photo fills in the total and shop', { timeout: 60000 }, async () => {
  const { ctx, page } = await phone(browser, server.url);
  try {
    await newTrip(page, { name: 'Tuscany', cur: '€', people: ['Chris', 'Leanne'], me: 'Chris' });
    await synced(page);                                                  // receipts are read via the server
    await page.click('#add');
    await page.setInputFiles('#fphoto', RECEIPT);
    await until(async () => (await page.inputValue('#famt')) === '29.69', 'total from the receipt');
    assert.equal(await page.inputValue('#fdesc'), 'Eurospin');
    assert.match(await text(page, '#scanmsg'), /Filled from receipt/);
    noErrors(page);
  } finally { await ctx.close(); }
});

test('an uneven split, by shares and by amount, and back to equal', { timeout: 60000 }, async () => {
  const { ctx, page } = await phone(browser, server.url);
  try {
    await newTrip(page, { name: 'Tuscany', cur: '€', people: ['Chris', 'Leanne', 'David', 'Sarah'], me: 'Chris' });
    await page.click('#add'); await page.fill('#famt', '120'); await page.fill('#fdesc', 'Cleaning');
    await page.click('[data-mode="sh"]');
    await page.locator('#splits [data-d="1"]').first().click();                 // Chris: 2 shares
    assert.match(await text(page, '#splits'), /Chris − 2 \+ €48\.00 .*Leanne − 1 \+ €24\.00/);
    await page.click('#eform button.primary');
    const row = () => page.locator('.row', { hasText: 'Cleaning' });
    assert.match(await row().innerText(), /uneven[\s\S]*you're owed €72\.00/);
    await row().click();
    assert.equal(await page.getAttribute('[data-mode="sh"]', 'aria-pressed'), 'true', 'opens as it was saved');
    await page.click('[data-mode="am"]');
    for (const [i, v] of ['50', '30', '20', '10'].entries()) await page.locator('[data-am]').nth(i).fill(v);
    assert.match(await text(page, '#ssum'), /€10\.00 left to assign/);
    await page.click('#eform button.primary');
    assert.match(await text(page, '#emsg'), /add up to €110\.00, not €120\.00/);
    await page.locator('[data-am]').nth(3).fill('20');
    assert.match(await text(page, '#ssum'), /Adds up/);
    await page.click('#eform button.primary');
    assert.match(await row().innerText(), /you're owed €70\.00/);
    const rows = await settleRows(page);
    assert.ok(rows.some(r => /Leanne . You €30\.00/.test(r)), rows.join(' | '));
    await tab(page, 'Expenses');
    await row().click(); await page.click('[data-mode="eq"]'); await page.click('#eform button.primary');
    assert.doesNotMatch(await row().innerText(), /uneven/);
    assert.match(await row().innerText(), /you're owed €90\.00/);
    noErrors(page);
  } finally { await ctx.close(); }
});

test('two phones: a change while you\'re editing is flagged, and Activity shows who did what', { timeout: 60000 }, async () => {
  const A = await phone(browser, server.url);
  try {
    await newTrip(A.page, { name: 'Lakes', cur: '£', people: ['Chris', 'Leanne'], me: 'Chris' });
    await addExpense(A.page, { amount: 90, desc: 'Dinner', paidBy: 'Chris' });
    await synced(A.page);
    const B = await phone(browser, await inviteLink(A.page));
    try {
      await B.page.click('.mecard [data-me][aria-label="Leanne"]');
      await A.page.locator('.row', { hasText: 'Dinner' }).click();                 // Chris is editing…
      await B.page.locator('.row', { hasText: 'Dinner' }).click();                 // …while Leanne changes it
      await B.page.fill('#famt', '96'); await B.page.click('#eform button.primary');
      await synced(B.page);
      await A.page.evaluate(() => sync());
      await until(() => A.page.locator('#clash').isVisible(), 'clash warning');
      assert.match(await text(A.page, '#clash'), /Leanne just changed this expense: amount £90\.00 → £96\.00/);
      await A.page.click('#useTheirs');
      await until(async () => (await A.page.inputValue('#famt')) === '96.00', 'their version');
      await closeSheet(A.page);
      assert.match(await text(A.page, '.actstrip.new'), /Leanne changed Dinner/, 'news from the group on Expenses');
      await A.page.click('[data-activity]');
      assert.match(await text(A.page, '#scrim'), /Leanne changed Dinner amount £90\.00 → £96\.00.*You added Dinner £90\.00/);
      noErrors(A.page); noErrors(B.page);
    } finally { await B.ctx.close(); }
  } finally { await A.ctx.close(); }
});

test('Help, What\'s new and the GitHub link are in Settings', { timeout: 60000 }, async () => {
  const { ctx, page } = await phone(browser, server.url);
  try {
    await newTrip(page, { people: ['Chris'], me: 'Chris' });
    await page.click('#gear');
    assert.equal(await page.getAttribute('.about a', 'href'), 'https://github.com/theirishkiwi/Holisplit');
    await page.click('#shelp');
    await until(() => page.locator('details.help').first().isVisible(), 'guide');
    assert.ok((await page.locator('details.help').count()) >= 6);
    noErrors(page);
  } finally { await ctx.close(); }
});
