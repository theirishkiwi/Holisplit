// Uneven splits through the page, and what an older version of the app does with data it doesn't understand.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

test('an expense split by shares shows "uneven" and each person\'s share in the balances', () => {
  const P = load();
  P.trip(['c', 'l', 'd'], [{ desc: 'Villa', amt: 9000, paidBy: 'c', for: ['c', 'l', 'd'], split: { m: 's', w: { c: 2, l: 1, d: 1 } }, lv: 2 }]);
  P.run(`prefs.me={[S.id]:'c'};tab='exp';open=new Set(['2026-10-01']);render()`);
  const row = P.w.document.querySelector('[data-edit="e0"]').textContent.replace(/\s+/g, ' ');
  assert.match(row, /uneven/);
  assert.match(row, /you're owed €45\.00/);
  assert.deepEqual(P.run('balances()'), { c: { paid: 9000, share: 4500 }, l: { paid: 0, share: 2250 }, d: { paid: 0, share: 2250 } });
  P.w.close();
});

test('something saved by a newer version: a banner asks to reload, and that expense can\'t be edited here', () => {
  const P = load();
  P.trip(['c', 'l'], [{ desc: 'Future', amt: 1000, paidBy: 'c', for: ['c', 'l'], lv: 99 }, { desc: 'Taxi', amt: 1000, paidBy: 'c', for: ['c', 'l'] }]);
  P.run(`tab='exp';open=new Set(['2026-10-01']);render()`);
  assert.equal(P.w.document.querySelector('#newer').hidden, false);
  P.run(`document.querySelector('[data-edit="e0"]').click()`);
  assert.equal(P.w.document.querySelector('#eform'), null, 'not opened');
  assert.match(P.w.document.querySelector('#toast').textContent, /Reload the app to edit this one/);
  P.run(`document.querySelector('[data-edit="e1"]').click()`);
  assert.ok(P.w.document.querySelector('#eform'), 'other expenses still open');
  P.w.close();
});

test('no banner for a trip made by this version', () => {
  const P = load();
  P.trip(['c', 'l'], [{ desc: 'Taxi', amt: 1000, paidBy: 'c', for: ['c', 'l'], split: { m: 'a', w: { c: 700, l: 300 } }, lv: 2 }]);
  P.run('render()');
  assert.equal(P.w.document.querySelector('#newer').hidden, true);
  P.w.close();
});
