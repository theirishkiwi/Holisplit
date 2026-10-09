// Expenses in another currency: the rate for the expense's own date is filled in (and can be overridden).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { load, kv, tick } = require('./helpers.cjs');

const W = () => import(path.join(__dirname, '..', 'worker.js'));
const TODAY = new Date().toISOString().slice(0, 10);

test('worker /api/rate?date=: fetches that day\'s rate once and keeps it for good; future dates get the latest', async () => {
  const { default: worker } = await W();
  const env = { TRIPS: kv() }, real = globalThis.fetch, calls = [];
  globalThis.fetch = async url => { calls.push(String(url)); return { ok: true, json: async () => ({ date: '2026-10-04', base: 'EUR', quote: 'GBP', rate: 0.85231 }) }; };
  const get = async q => { const r = await worker.fetch(new Request('https://x/api/rate/EUR/GBP' + q), env); return [r.status, await r.json()]; };
  try {
    const [st, j] = await get('?date=2026-10-04');
    assert.equal(st, 200); assert.equal(j.rate, 0.85231); assert.equal(j.date, '2026-10-04');
    assert.equal(calls[0], 'https://api.frankfurter.dev/v2/rate/eur/gbp?date=2026-10-04');
    assert.equal(env.TRIPS.ttl.get('rate:EUR:GBP:2026-10-04'), undefined, 'a past rate never changes: kept for good');
    await get('?date=2026-10-04');
    assert.equal(calls.length, 1, 'served from storage the second time');
    assert.equal((await get('?date=4/10/2026'))[0], 400);
    assert.equal((await get('?date=2026-13-45'))[0], 400);
    await get('?date=2999-01-01');
    assert.equal(calls.at(-1), 'https://api.frankfurter.dev/v2/rate/eur/gbp', 'future date: the latest rate');
    assert.ok(!env.TRIPS.m.has('rate:EUR:GBP:2026-10-04') || !String(env.TRIPS.m.get('rate:EUR:GBP:last')).includes('2999'));
  } finally { globalThis.fetch = real; }
});

// a £ trip; the fake rate service knows two days
const RATES = { '2026-10-04': 0.85231, '2026-10-02': 0.85297 };
function phone({ online = true } = {}) {
  const asked = [];
  const P = load({ fetch: async u => {
    u = String(u);
    if (u.includes('/api/rate/')) {
      asked.push(u);
      const d = (u.match(/date=([\d-]+)/) || [])[1], rate = RATES[d];
      if (!online || !rate) return { ok: false, status: 503, json: async () => ({ error: 'rate unavailable' }) };
      return { ok: true, status: 200, json: async () => ({ ok: true, rate, date: d, source: 'Frankfurter' }) };
    }
    throw new TypeError('offline');
  } });
  P.run(`S=blank();S.name='Tuscany';S.cur='£';S.dirty=false;
    S.people.push({id:'c',name:'Chris',c:0,u:1},{id:'l',name:'Leanne',c:1,u:1});
    syncAvail=true;prefs.me={[S.id]:'c'};tab='exp';render()`);
  const $ = s => P.w.document.querySelector(s);
  const click = s => P.run(`document.querySelector(${JSON.stringify(s)}).click()`);
  const txt = el => el.textContent.replace(/\s+/g, ' ').trim();
  const setDate = d => P.run(`(()=>{const t=document.querySelector('#fdate');t.value='${d}';t.oninput()})()`);
  return { P, $, click, txt, setDate, asked };
}

test('pick € on a £ trip: the rate for the expense\'s date is filled in, with where it came from', async () => {
  const { P, $, click, txt, setDate, asked } = phone();
  try {
    click('#add');
    assert.ok($('#ccbtn svg'), 'the currency box shows it opens a menu');
    assert.equal($('#ccbtn').textContent, '£');
    setDate('2026-10-04');
    click('#ccbtn'); click('[data-cc="€"]'); await tick(20);
    assert.equal(asked.at(-1), '/api/rate/EUR/GBP?date=2026-10-04');
    assert.equal($('#frate').value, '0.85231');
    assert.match(txt($('#rnote')), /Rate for 4 Oct from Frankfurter/);
    assert.equal($('#rnote a').getAttribute('href'), 'https://frankfurter.dev/');
    P.run(`(()=>{const a=document.querySelector('#famt');a.value='56.30';a.oninput()})()`);
    assert.equal(txt($('#conv')), '= £47.99', '€56.30 × 0.85231 = £47.985, rounded');
    setDate('2026-10-02'); await tick(20);
    assert.equal($('#frate').value, '0.85297', 'new date, new rate');
    assert.match(txt($('#rnote')), /Rate for 2 Oct/);
    P.run(`document.querySelector('#fdesc').value='Dinner'`);
    P.run(`document.querySelector('#eform').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
    const e = P.run('S.expenses.at(-1)');
    assert.deepEqual([e.cc, e.oamt, e.rate, e.amt, e.date], ['€', 5630, 0.85297, 4802, '2026-10-02']);
  } finally { P.w.close(); }
});

test('a rate you type is kept: changing the date doesn\'t replace it, until you ask for the day\'s rate', async () => {
  const { P, $, click, txt, setDate, asked } = phone();
  try {
    click('#add'); setDate('2026-10-04');
    click('#ccbtn'); click('[data-cc="€"]'); await tick(20);
    P.run(`(()=>{const r=document.querySelector('#frate');r.value='0.84';r.oninput()})()`);
    assert.match(txt($('#rnote')), /Your rate\. Use the rate for 4 Oct/);
    const n = asked.length;
    setDate('2026-10-02'); await tick(20);
    assert.equal($('#frate').value, '0.84', 'kept');
    assert.equal(asked.length, n, 'no lookup');
    click('#useDay'); await tick(20);
    assert.equal($('#frate').value, '0.85297');
    assert.match(txt($('#rnote')), /Rate for 2 Oct from Frankfurter/);
  } finally { P.w.close(); }
});

test('no signal: falls back to the last rate you used, and says so', async () => {
  const { P, $, click, txt, setDate } = phone({ online: false });
  try {
    P.run(`S.expenses.push({id:'old',desc:'Taxi',amt:1700,oamt:2000,cc:'€',rate:0.85,date:'2026-10-01',paidBy:'c',for:['c','l'],cat:'transport',u:5})`);
    click('#add'); setDate('2026-10-04');
    click('#ccbtn'); click('[data-cc="€"]'); await tick(20);
    assert.equal($('#frate').value, '0.85');
    assert.match(txt($('#rnote')), /Couldn't get the rate for 4 Oct \(no signal\?\)\. Using your last rate/);
  } finally { P.w.close(); }
});

test('editing an existing expense keeps its saved rate', async () => {
  const { P, $, txt, asked } = phone();
  try {
    P.run(`S.expenses.push({id:'x',desc:'Taxi',amt:1700,oamt:2000,cc:'€',rate:0.85,date:'2026-10-04',paidBy:'c',for:['c','l'],cat:'transport',u:5});open=new Set(['2026-10-04']);render()`);
    P.run(`document.querySelector('[data-edit="x"]').click()`); await tick(20);
    assert.equal($('#frate').value, '0.85');
    assert.equal(asked.length, 0, 'no lookup on open');
    assert.match(txt($('#rnote')), /Your rate\. Use the rate for 4 Oct/, 'but you can switch to the day\'s rate');
  } finally { P.w.close(); }
});
