// Paying people: payment links (Monzo, Revolut, Starling), bank details, Remind, and the "Did you pay?" prompt.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, tick } = require('./helpers.cjs');

const P = load();
test.after(() => P.w.close());
const $ = s => P.w.document.querySelector(s), $$ = s => [...P.w.document.querySelectorAll(s)];
const click = el => el.dispatchEvent(new P.w.MouseEvent('click', { bubbles: true }));
const submit = el => el.dispatchEvent(new P.w.Event('submit', { bubbles: true, cancelable: true }));
const setVal = (sel, v) => { $(sel).value = v; };
const trip = (cur, me) => P.run(`S=blank();S.name='Tuscany';S.cur='${cur}';
  S.people.push({id:'c',name:'Chris',c:0,u:1,pay:{monzo:'chrisd',revolut:'chris88',starling:'chris-d',bname:'C Doyle',sort:'123456',acct:'12345678'}},{id:'s',name:'Sam',c:1,u:1},{id:'a',name:'Alex',c:2,u:1});
  S.expenses.push({id:'x1',desc:'Dinner',amt:9000,date:'2026-10-05',paidBy:'c',for:['c','s','a'],cat:'food',u:2});
  prefs.me={[S.id]:${me ? `'${me}'` : 'null'}};tab='bal';save();close();render()`);

test('payment handles: names, @names and pasted links are accepted; junk is not', () => {
  const cases = [['chris', 'monzo.me', 'chris'], ['@chris88', 'revolut.me', 'chris88'], ['https://monzo.me/chrisd/12.50?d=x', 'monzo.me', 'chrisd'],
    ['settleup.starlingbank.com/chris-d', 'settleup.starlingbank.com', 'chris-d'], ['', 'monzo.me', ''], ['not a name!', 'monzo.me', null]];
  for (const [v, site, want] of cases) assert.equal(P.run(`parseHandle(${JSON.stringify(v)},${JSON.stringify(site)})`), want, v);
});

test('links: Monzo gets the amount and reference on a £ trip only; others open the payee page', () => {
  trip('£', 's');
  assert.equal(P.run(`payLink('monzo','chrisd',3000,'s')`), 'https://monzo.me/chrisd/30.00?d=Tuscany%20Sam');
  assert.equal(P.run(`payLink('revolut','chris88',3000,'s')`), 'https://revolut.me/chris88');
  assert.equal(P.run(`payLink('starling','chris-d',3000,'s')`), 'https://settleup.starlingbank.com/chris-d');
  trip('€', 's');
  assert.equal(P.run(`payLink('monzo','chrisd',3000,'s')`), 'https://monzo.me/chrisd', 'Monzo is sterling only: no € amount');
});

test('bank reference fits the UK 18-character limit', () => {
  P.run(`S.name='A very long holiday name in Tuscany!'`);
  const r = P.run(`bankRef('s')`);
  assert.ok(r.length <= 18 && /^[A-Za-z0-9 &.-]+$/.test(r), r);
  P.run(`S.name='Tuscany'`);
});

test('buttons depend on who you are: payer sees Pay, the person owed sees Remind and Mark paid', () => {
  trip('£', 's');
  const label = b => b.getAttribute('aria-label') || b.textContent.trim();
  const row = () => [...$$('.srow')[0].querySelectorAll('.acts > *')].map(label).join(' ');
  assert.equal(row(), 'Pay');
  trip('£', 'c');
  assert.equal(row(), 'Remind on WhatsApp Mark paid');
  trip('£', 'a');
  P.run(`prefs.othersOpen=true;render()`);
  const other = $$('.srow').find(r => r.textContent.includes('Sam'));
  assert.equal([...other.querySelectorAll('.acts > *')].map(label).join(' '), 'Mark as paid', 'someone else\'s debt');
  assert.equal(other.querySelector('[data-settle]').textContent.trim(), 'Paid?', 'reads as a question when you\'re not involved');
  trip('£', 'c');
  assert.equal($('[data-settle]').textContent.trim(), 'Paid', 'your own: no question mark');
});

test('Remind sends a WhatsApp message with the amount and how to pay', () => {
  trip('£', 'c');
  const href = decodeURIComponent($('[data-remind]').getAttribute('href'));
  assert.match(href, /^https:\/\/wa\.me\/\?text=/);
  assert.match(href, /you owe me £30\.00/);
  assert.match(href, /Monzo: https:\/\/monzo\.me\/chrisd\/30\.00/);
  assert.match(href, /sort code 12-34-56, account 12345678, reference "Tuscany (Sam|Alex)"/);
});

test('Pay shows every option the payee added, with copy buttons for bank details', () => {
  trip('£', 's');
  click($('[data-pay-i]'));
  assert.deepEqual($$('.payopt b').map(b => b.textContent), ['Monzo', 'Revolut', 'Starling']);
  assert.ok($('.bankbox'));
  assert.deepEqual($$('.bankbox [data-copy]').map(b => b.dataset.copy), ['C Doyle', '123456', '12345678', 'Tuscany Sam']);
  click($('[data-dismiss]'));
});

test('after leaving for a payment app, coming back asks "Did you pay?" and records it with Undo', async () => {
  trip('£', 's');
  click($('[data-pay-i]'));
  click($('.payopt'));                                   // opens Monzo
  assert.ok(P.run('!!pendingPay'));
  P.run('pendingPay.at=Date.now()-5000;checkPending()'); // back in the app
  assert.match($('#scrim h3').textContent, /Did you pay Chris/);
  click($('#yesPaid'));
  assert.equal($$('[data-pay-i]').length, 0, 'Sam no longer owes');
  assert.match($('#toast').textContent, /Marked as paid/);
  click($('#toast button'));
  assert.equal($$('[data-pay-i]').length, 1, 'Undo restores the debt');
});

test('"Not yet" records nothing; "I\'ve paid" records directly', async () => {
  trip('£', 's');
  click($('[data-pay-i]')); click($('.payopt'));
  P.run('pendingPay.at=Date.now()-5000;checkPending()');
  click([...$$('#scrim [data-dismiss]')].find(b => b.textContent.includes('Not yet')));
  assert.equal($$('[data-pay-i]').length, 1);
  assert.equal(P.run('pendingPay'), null);
  click($('[data-pay-i]')); click($('#iPaid'));
  assert.equal($$('[data-pay-i]').length, 0);
});

test('no prompt if you come back much later or are on another trip', () => {
  trip('£', 's');
  P.run(`setPending({trip:'other',from:'s',to:'c',amt:3000,at:Date.now()-5000});checkPending()`);
  assert.ok($('#scrim').hidden);
  P.run(`setPending({trip:S.id,from:'s',to:'c',amt:3000,at:Date.now()-31*60e3});checkPending()`);
  assert.ok($('#scrim').hidden);
  assert.equal(P.run('pendingPay'), null);
});

test('payee without details: Pay offers to add them or ask on WhatsApp', () => {
  // Alex pays a big bill and has no payment details; Sam (this phone) owes Alex
  trip('£', 's');
  P.run(`S.expenses.push({id:'x2',desc:'Villa',amt:18000,date:'2026-10-05',paidBy:'a',for:['c','s','a'],cat:'stay',u:3});render()`);
  const toAlex = $$('.srow').find(r => /You.*Alex/.test(r.textContent));
  assert.ok(toAlex, 'Sam owes Alex');
  click(toAlex.querySelector('[data-pay-i]'));
  assert.match($('.askpay').textContent, /hasn't added payment details/);
  assert.ok($('#scrim [data-paydetails="a"]'), 'offers to add Alex\'s details');
  assert.match(decodeURIComponent($('#scrim a.wa').getAttribute('href')), /how should I pay you the £90\.00/);
  click($('[data-dismiss]'));
});

test('payment details form: validates, accepts pasted links, saves and syncs', () => {
  trip('£', 's');
  P.run(`openPayDetails('s')`);
  setVal('#pd_monzo', 'https://monzo.me/samsmith'); setVal('#pd_sort', '12 34 5'); setVal('#pd_acct', '12345678');
  submit($('#pdform'));
  assert.match($('#pdmsg').textContent, /6 digits/);
  setVal('#pd_sort', '12-34-56'); setVal('#pd_revolut', 'bad name!');
  submit($('#pdform'));
  assert.match($('#pdmsg').textContent, /Revolut/);
  setVal('#pd_revolut', '@sam_s');
  const u0 = P.run(`person('s').u`);
  submit($('#pdform'));
  assert.deepEqual(P.run(`person('s').pay`), { monzo: 'samsmith', revolut: 'sam_s', sort: '123456', acct: '12345678' });
  assert.ok(P.run(`person('s').u`) > u0 && P.run('S.dirty'), 'marked for sync');
});
