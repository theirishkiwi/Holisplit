// Activity: every change is written to the trip's log by save(), merged between phones, and shown in the Activity sheet.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { load } = require('./helpers.cjs');

function phone() {
  const P = load();
  P.run(`S=blank();S.name='Tuscany';S.cur='€';S.people.push({id:'c',name:'Chris',c:0,u:1},{id:'l',name:'Leanne',c:1,u:1});
    prefs.me={[S.id]:'c'};tab='exp';render()`);
  const $ = s => P.w.document.querySelector(s);
  const txt = s => $(s).textContent.replace(/\s+/g, ' ').trim();
  const log = () => P.run('(S.log||[]).map(x=>[x.k,x.a,x.d,x.m,(x.x||[]).join(" · "),x.by])');
  return { P, $, txt, log };
}

test('setting up the trip isn\'t logged; adding, changing, deleting and restoring an expense is', () => {
  const { P, log } = phone();
  try {
    P.run(`S.name='Italy';save()`);
    assert.deepEqual(log(), [], 'nothing before the first expense');
    P.run(`S.expenses.push({id:'x',desc:'Dinner',amt:9000,date:'2026-10-01',paidBy:'c',for:['c','l'],cat:'food',u:now()});save()`);
    P.run(`Object.assign(S.expenses[0],{amt:9600,paidBy:'l',u:now()});save()`);
    P.run(`removeExp(S.expenses[0])`);
    P.run(`document.querySelector('.toast button').click()`);         // Undo
    assert.deepEqual(log(), [
      ['e', 'add', 'Dinner', 9000, '', 'c'],
      ['e', 'edit', 'Dinner', 9600, 'amount €90.00 → €96.00 · paid by Chris → Leanne', 'c'],
      ['e', 'del', 'Dinner', 9600, '', 'c'],
      ['e', 'back', 'Dinner', 9600, '', 'c'],
    ]);
    P.run(`S.expenses[0].split={m:'s',w:{c:2,l:1}};S.expenses[0].u=now();save()`);
    assert.deepEqual(log().at(-1), ['e', 'edit', 'Dinner', 9600, 'split everyone → uneven', 'c']);
    P.run(`S.people.push({id:'s',name:'Sara',c:2,u:now()});save()`);
    assert.deepEqual(log().at(-1), ['g', 'add', 'Sara', null, '', 'c']);
    P.run(`S.expenses[0].pe=1;save()`);
    assert.equal(log().length, 6, 'a change you can\'t see (photo upload flag) isn\'t logged');
  } finally { P.w.close(); }
});

test('payments are logged as payments', () => {
  const { P, log } = phone();
  try {
    P.run(`S.expenses.push({id:'x',desc:'Dinner',amt:9000,date:'2026-10-01',paidBy:'c',for:['c','l'],cat:'food',u:now()});save()`);
    P.run(`addPayment('l','c',4500)`);
    assert.deepEqual(log().at(-1), ['p', 'add', 'Leanne → Chris', 4500, '', 'c']);
  } finally { P.w.close(); }
});

test('logs from two phones merge by entry; the dot shows changes by others until you look', async () => {
  const { P, $, txt, log } = phone();
  try {
    P.run(`S.expenses.push({id:'x',desc:'Dinner',amt:9000,date:'2026-10-01',paidBy:'c',for:['c','l'],cat:'food',u:now()});save()`);
    const mine = P.run('S.log[0]');
    const theirs = { id: 'zz1', t: Date.now() + 5, by: 'l', k: 'e', a: 'add', i: 'y', d: 'Taxi', m: 3000 };
    P.run(`mergeIn(${JSON.stringify({ people: [], expenses: [{ id: 'y', desc: 'Taxi', amt: 3000, date: '2026-10-01', paidBy: 'l', for: ['c', 'l'], cat: 'transport', u: Date.now() + 5 }], log: [mine, theirs] })})`);
    assert.deepEqual(log().map(x => x[2]), ['Dinner', 'Taxi'], 'each entry once');
    assert.equal(P.run('S.expenses.length'), 2);
    assert.equal(log().length, 2, 'merging from the group doesn\'t log it again as this phone\'s change');
    assert.equal($('#actBtn').hidden, false);
    assert.ok($('#actBtn').classList.contains('dot'), 'new from Leanne');
    P.run(`document.querySelector('#actBtn').click()`);
    assert.match(txt('#scrim'), /Activity.*Leanne added Taxi €30\.00.*You added Dinner €90\.00/);
    assert.ok(!$('#actBtn').classList.contains('dot'), 'seen');
    P.run(`document.querySelector('[data-act="y"]').click()`);
    await new Promise(r => setTimeout(r, 80));
    assert.match(txt('#eform h3'), /Edit expense/, 'tapping an entry opens the expense');
  } finally { P.w.close(); }
});

test('the server keeps and merges the log for older unencrypted trips', async () => {
  const { default: worker } = await import(path.join(__dirname, '..', 'worker.js'));
  const { kv } = require('./helpers.cjs');
  const env = { TRIPS: kv() }, id = 'abcdefghijklmnop';
  const put = body => worker.fetch(new Request(`https://x/api/trip/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env).then(r => r.json());
  const base = { v: 1, id, name: 'T', cur: '€', people: [], expenses: [], u: 1 };
  await put({ ...base, log: [{ id: 'a', t: 1 }] });
  const out = await put({ ...base, u: 2, log: [{ id: 'b', t: 2 }, { id: 'a', t: 1 }] });
  assert.deepEqual(out.log.map(x => x.id), ['a', 'b']);
});
