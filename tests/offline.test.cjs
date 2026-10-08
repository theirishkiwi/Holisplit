// Offline: a clear banner, expenses still work, and it syncs by itself when signal returns.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { load, kv, workerFetch, tick } = require('./helpers.cjs');

const W = () => import(path.join(__dirname, '..', 'worker.js'));
const TID = 'tuscanytrip000000001';
// a returning phone: it has reached the server before and has a real trip open
const returning = w => {
  w.localStorage.setItem('hs-trip-' + TID, JSON.stringify({ v: 1, id: TID, name: 'Tuscany', cur: '€', nu: 1, u: 1,
    people: [{ id: 'c', name: 'Chris', c: 0, u: 1 }, { id: 'l', name: 'Leanne', c: 1, u: 1 }], expenses: [] }));
  w.localStorage.setItem('holiday-split-prefs', JSON.stringify({ sync: true, hosted: true, cur: TID, trips: [{ id: TID, name: 'Tuscany' }] }));
};

async function phone({ online, seen = true }) {
  const { default: worker } = await W();
  const env = { TRIPS: kv() }, net = { up: online }, real = workerFetch(worker, env);
  const P = load({ fetch: (u, i) => net.up ? real(u, i) : Promise.reject(new TypeError('Failed to fetch')), before: seen ? returning : undefined });
  await tick(80);
  return { P, env, net, $: s => P.w.document.querySelector(s) };
}

test('opening with no signal: banner says offline, cloud shows offline (not hidden)', async () => {
  const { P, $ } = await phone({ online: false });
  try {
    assert.equal($('#offline').hidden, false);
    assert.match($('#offText').textContent, /You're offline\. You can still add and edit expenses/);
    assert.equal($('#cloud').hidden, false, 'cloud stays visible');
    assert.equal($('#cloud').dataset.s, 'offline');
    assert.equal($('#cloud use').getAttribute('href'), '#i-cloudoff');
  } finally { P.w.close(); }
});

test('add an expense offline: kept on the phone, banner says so; signal returns and it syncs by itself', async () => {
  const { P, env, net, $ } = await phone({ online: false });
  try {
    P.run(`S.expenses.push({id:'e1',desc:'Gelato',amt:900,date:today(),paidBy:'c',for:['c','l'],cat:'food',u:2});save();render()`);
    await tick(700);
    assert.equal(P.run('S.expenses.length'), 1, 'saved locally');
    assert.match($('#offText').textContent, /Your changes are saved on this phone and will sync when you're back online/);
    assert.ok(![...env.TRIPS.m.keys()].some(k => k.startsWith('trip:')), 'nothing reached the server yet');
    net.up = true;
    P.w.dispatchEvent(new P.w.Event('online'));
    await tick(150);
    assert.equal($('#offline').hidden, true, 'banner gone');
    assert.equal($('#cloud').dataset.s, 'ok');
    assert.equal($('#cloud use').getAttribute('href'), '#i-cloud');
    assert.ok(env.TRIPS.m.get('trip:' + TID).includes('Gelato'), 'expense synced to the server');
    assert.equal(P.run('S.dirty'), false);
  } finally { P.w.close(); }
});

test('losing signal while open shows the banner; Retry says if still offline', async () => {
  const { P, net, $ } = await phone({ online: true });
  try {
    assert.equal($('#offline').hidden, true, 'online: no banner');
    net.up = false;
    P.w.dispatchEvent(new P.w.Event('offline'));
    assert.equal($('#offline').hidden, false);
    P.run(`document.querySelector('#retryBtn').click()`);
    await tick(80);
    assert.match(P.w.document.body.textContent, /Still offline/);
    net.up = true;
    P.run(`document.querySelector('#retryBtn').click()`);
    await tick(120);
    assert.equal($('#offline').hidden, true);
  } finally { P.w.close(); }
});

test('a phone that has never reached the server (e.g. the file opened directly) shows no offline banner', async () => {
  const { P, $ } = await phone({ online: false, seen: false });
  try {
    assert.equal($('#offline').hidden, true);
    assert.equal($('#cloud').hidden, true);
  } finally { P.w.close(); }
});
