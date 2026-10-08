// Settle up in another currency: a € trip settled in £ at a live (or your own) rate.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { load, kv, tick } = require('./helpers.cjs');

const W = () => import(path.join(__dirname, '..', 'worker.js'));
const TODAY = new Date().toISOString().slice(0, 10);

// ---- server: /api/rate ----
async function withUpstream(reply, fn) {
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url) => { calls.push(String(url)); if (reply instanceof Error) throw reply; return { ok: true, json: async () => reply }; };
  try { return await fn(calls); } finally { globalThis.fetch = real; }
}
const rate = async (worker, env, a = 'EUR', b = 'GBP') => {
  const r = await worker.fetch(new Request(`https://x/api/rate/${a}/${b}`), env);
  return [r.status, await r.json()];
};

test('worker /api/rate: fetches the daily rate once, then serves it from storage', async () => {
  const { default: worker } = await W();
  const env = { TRIPS: kv() };
  await withUpstream({ date: TODAY, base: 'EUR', quote: 'GBP', rate: 0.8612 }, async calls => {
    assert.deepEqual(await rate(worker, env), [200, { ok: true, rate: 0.8612, date: TODAY, source: 'Frankfurter' }]);
    assert.equal(calls[0], 'https://api.frankfurter.dev/v2/rate/eur/gbp');
    await rate(worker, env);
    assert.equal(calls.length, 1, 'second phone the same day: no new request');
  });
  assert.equal((await rate(worker, env, 'EUR', 'EUR'))[0], 400);
  assert.equal((await rate(worker, env, 'EU', 'GBP'))[0], 404, 'not a currency code: not this route');
});

test('worker /api/rate: if the rate service is down, uses the last known rate; none at all is a 503', async () => {
  const { default: worker } = await W();
  const env = { TRIPS: kv() };
  await withUpstream(new Error('down'), async () => assert.equal((await rate(worker, env))[0], 503));
  env.TRIPS.m.set('rate:EUR:GBP:last', JSON.stringify({ rate: 0.85, date: '2026-10-01', source: 'Frankfurter' }));
  await withUpstream(new Error('down'), async () => {
    const [st, j] = await rate(worker, env);
    assert.equal(st, 200); assert.equal(j.rate, 0.85); assert.equal(j.stale, true);
  });
  await withUpstream({ rate: -1 }, async () => assert.equal((await rate(worker, env))[1].stale, true, 'nonsense rate ignored'));
});

test('worker: an unencrypted trip keeps its settle currency when synced, newest wins', async () => {
  const { default: worker } = await W();
  const env = { TRIPS: kv() }, id = 'settletrip0000000001', url = 'https://x/api/trip/' + id;
  const put = body => worker.fetch(new Request(url, { method: 'PUT', body: JSON.stringify(body) }), env);
  const base = { v: 1, id, name: 'T', cur: '€', nu: 1, u: 1, people: [], expenses: [] };
  await put({ ...base, sx: { cc: '£', rate: 0.86, mode: 'live' }, sxu: 5 });
  await put({ ...base, sx: { cc: '$', rate: 1.1, mode: 'manual' }, sxu: 3 });   // older edit from another phone
  const got = await (await worker.fetch(new Request(url), env)).json();
  assert.deepEqual([got.sx.cc, got.sx.rate, got.sxu], ['£', 0.86, 5]);
});

// ---- app ----
function phone(rateReply = { ok: true, rate: 0.86, date: TODAY, source: 'Frankfurter' }) {
  const asked = [];
  const P = load({ fetch: async (u) => {
    if (String(u).includes('/api/rate/')) { asked.push(String(u)); return { ok: !!rateReply, status: rateReply ? 200 : 503, json: async () => rateReply || { error: 'x' } }; }
    throw new TypeError('offline');
  } });
  // € trip: Chris paid €90 dinner for three; Sam and Alex each owe Chris €30. Chris settles in £ with Monzo.
  P.run(`S=blank();S.name='Tuscany';S.cur='€';S.dirty=false;
    S.people.push({id:'c',name:'Chris',c:0,u:1,pay:{monzo:'chrisd'}},{id:'s',name:'Sam',c:1,u:1},{id:'a',name:'Alex',c:2,u:1});
    S.expenses.push({id:'x1',desc:'Dinner',amt:9000,date:'2026-10-05',paidBy:'c',for:['c','s','a'],cat:'food',u:2});
    syncAvail=true;prefs.me={[S.id]:'s'};prefs.othersOpen=true;tab='bal';save();render()`);
  const $ = s => P.w.document.querySelector(s), $$ = s => [...P.w.document.querySelectorAll(s)];
  const click = el => el.dispatchEvent(new P.w.MouseEvent('click', { bubbles: true }));
  const txt = el => el.textContent.replace(/\s+/g, ' ').trim();
  return { P, $, $$, click, txt, asked };
}

test('settling in £: Who pays who, the summary, Monzo link and reminder all use £; expenses stay in €', async () => {
  const { P, $, $$, txt } = phone();
  try {
    assert.match(txt($('#sxBtn')), /Amounts in €\s*Settle in another currency/);
    P.run(`S.sx={cc:'£',rate:0.86,mode:'manual',date:'${TODAY}',day:'${TODAY}'};S.sxu=now();render()`);
    assert.match(txt($('#sxBtn')), /Amounts in £ · €1 = £0\.86\s*your rate/);
    assert.deepEqual($$('.srow .amt').map(txt), ['£25.80', '£25.80'], '€30 → £25.80 each');
    assert.match(P.run('summary()'), /Sam → Chris: \*£25\.80\*[\s\S]*_€1 = £0\.86_/);
    assert.equal(P.run(`payLink('monzo','chrisd',3000,'s')`), 'https://monzo.me/chrisd/25.80?d=Tuscany%20Sam', 'Monzo gets the £ amount');
    P.run(`prefs.me={[S.id]:'c'}`);
    assert.match(P.run(`remindText(lastT[0][0],lastT[0][1],lastT[0][2])`), /you owe me £25\.80/);
    assert.match(P.run(`meCard()`), /owed <b class="pos">£51\.60/);
    P.run(`tab='exp';open=new Set(['2026-10-05']);render()`);
    assert.match(txt($('[data-edit="x1"]')), /€90\.00/, 'expenses still in €');
  } finally { P.w.close(); }
});

test('paying in £ records what was sent and the exact € amount, so the debt clears to the cent; first payment fixes a live rate', async () => {
  const { P, $, $$, click, txt } = phone();
  try {
    P.run(`S.sx={cc:'£',rate:0.8612,mode:'live',date:'${TODAY}',day:'${TODAY}'};S.sxu=1;render()`);
    click($('[data-pay-i]'));                                    // Sam pays Chris
    assert.match(txt($('.payamt')), /£25\.84/);
    assert.match(txt($('.payrate')), /€1 = £0\.8612 · €30\.00/);
    click($('#iPaid'));
    const p = P.run('S.expenses.find(e=>e.type==="pay")');
    assert.deepEqual([p.amt, p.cc, p.oamt], [3000, '£', 2584], '€30.00 exactly, £25.84 sent');
    assert.equal($$('.srow').length, 1, "Sam's debt is gone, only Alex's left");
    assert.equal(P.run('S.sx.fixed'), TODAY, 'live rate now fixed');
    assert.ok(P.run('S.sxu') > 1, 'syncs');
    assert.match(txt($('#sxBtn')), /fixed/);
    assert.match(P.run('JSON.stringify([...document.querySelectorAll("#bal .card .row .amt")].map(x=>x.textContent))'), /£25\.84/, 'Paid list shows £ sent');
  } finally { P.w.close(); }
});

test('Record payment form: typed in £, converted at the rate; the suggested amount clears exactly', async () => {
  const { P, $, $$, click } = phone();
  try {
    P.run(`S.sx={cc:'£',rate:0.86,mode:'manual'};S.sxu=1;prefs.me={[S.id]:'c'};render()`);
    click($('[data-settle]'));                                  // Chris marks Sam's (or Alex's) payment
    assert.equal($('#pamt').value, '25.80');
    assert.match($('#pamt').placeholder, /^£/);
    $('#pform2').dispatchEvent(new P.w.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(P.run('S.expenses.filter(e=>e.type==="pay")[0].amt'), 3000);
    click($('[data-settle]'));
    $('#pamt').value = '10';                                    // a part payment of £10
    $('#pform2').dispatchEvent(new P.w.Event('submit', { bubbles: true, cancelable: true }));
    const part = P.run('S.expenses.filter(e=>e.type==="pay")[1]');
    assert.deepEqual([part.amt, part.oamt, part.cc], [1163, 1000, '£'], '£10 ≈ €11.63');
    assert.equal(P.run('S.sx.fixed'), undefined, 'a rate you typed is never "fixed" — it is already yours');
  } finally { P.w.close(); }
});

test('live rate refreshes once a day until fixed; not after', async () => {
  const { P, asked } = phone({ ok: true, rate: 0.87, date: TODAY, source: 'Frankfurter' });
  try {
    P.run(`S.sx={cc:'£',rate:0.86,mode:'live',date:'2026-10-01',day:'2026-10-01'};S.sxu=1;render()`);
    await tick(30);
    assert.equal(asked[0], '/api/rate/EUR/GBP');
    assert.equal(P.run('S.sx.rate'), 0.87); assert.equal(P.run('S.sx.day'), P.run('today()'));
    P.run('render()'); await tick(20);
    assert.equal(asked.length, 1, 'once a day');
    P.run(`S.sx.day='2026-10-02';S.sx.fixed='2026-10-02';render()`); await tick(20);
    assert.equal(asked.length, 1, 'fixed: no more refreshing');
    P.run(`S.sx={cc:'£',rate:0.9,mode:'manual',day:'2026-10-01'};render()`); await tick(20);
    assert.equal(asked.length, 1, 'your own rate: never replaced');
  } finally { P.w.close(); }
});

test('the currency sheet: pick £ (live rate filled in), type your own, or go back to €', async () => {
  const { P, $, $$, click, txt } = phone();
  try {
    click($('#sxBtn'));
    click($$('[data-sxcc]').find(b => b.textContent === '£'));
    await tick(30);
    assert.equal($('#sxrate').value, '0.86');
    assert.match(txt($('#sxInfo')), /Live rate from Frankfurter/);
    $('#sxform').dispatchEvent(new P.w.Event('submit', { bubbles: true, cancelable: true }));
    assert.deepEqual(P.run('[S.sx.cc,S.sx.rate,S.sx.mode]'), ['£', 0.86, 'live']);
    click($('#sxBtn'));
    $('#sxrate').value = '0,855'; $('#sxrate').oninput({ target: $('#sxrate') });
    assert.match(txt($('#sxInfo')), /Your rate/);
    assert.equal($('#sxLive').hidden, false, 'can go back to the live rate');
    $('#sxform').dispatchEvent(new P.w.Event('submit', { bubbles: true, cancelable: true }));
    assert.deepEqual(P.run('[S.sx.rate,S.sx.mode]'), [0.855, 'manual']);
    click($('#sxBtn'));
    click($$('[data-sxcc]').find(b => b.textContent === '€'));
    $('#sxform').dispatchEvent(new P.w.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(P.run('S.sx'), null);
    assert.deepEqual($$('.srow .amt').map(txt), ['€30.00', '€30.00']);
  } finally { P.w.close(); }
});

test('no signal: the sheet asks you to type the rate (and suggests one you used before)', async () => {
  const { P, $, $$, click, txt } = phone(null);
  try {
    P.run(`prefs.rates={'£':1.17}`);                            // you once entered £1 = €1.17 on an expense
    click($('#sxBtn'));
    click($$('[data-sxcc]').find(b => b.textContent === '£'));
    await tick(30);
    assert.match(txt($('#sxInfo')), /Couldn't get today's rate/);
    assert.equal($('#sxrate').value, '0.8547', 'inverse of £1 = €1.17');
  } finally { P.w.close(); }
});

test('sync: a newer settle currency from another phone replaces ours', () => {
  const { P } = phone();
  try {
    P.run(`S.sx={cc:'£',rate:0.86,mode:'live'};S.sxu=5`);
    P.run(`mergeIn({people:[],expenses:[],sx:{cc:'£',rate:0.9,mode:'manual'},sxu:9})`);
    assert.deepEqual(P.run('[S.sx.rate,S.sx.mode]'), [0.9, 'manual']);
    P.run(`mergeIn({people:[],expenses:[],sx:null,sxu:7})`);
    assert.equal(P.run('S.sx.rate'), 0.9, 'older change ignored');
  } finally { P.w.close(); }
});
