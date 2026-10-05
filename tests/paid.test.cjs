// "Mark paid" works like a toggle: recorded payments can be un-marked, and every step has Undo.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, tick } = require('./helpers.cjs');

const P = load();
test.after(() => P.w.close());
const $ = s => P.w.document.querySelector(s), $$ = s => [...P.w.document.querySelectorAll(s)];
const click = el => el.dispatchEvent(new P.w.MouseEvent('click', { bubbles: true }));
const submit = el => el.dispatchEvent(new P.w.Event('submit', { bubbles: true, cancelable: true }));
const owed = () => $$('[data-settle]').length;

test('setup: a trip where Sam owes Chris', () => {
  P.run(`S=blank();S.people.push({id:'c',name:'Chris',c:0,u:1},{id:'s',name:'Sam',c:1,u:1});
         S.expenses.push({id:'x1',desc:'Dinner',amt:6000,date:'2026-10-05',paidBy:'c',for:['c','s'],cat:'food',u:2});tab='bal';save();render()`);
  assert.equal(owed(), 1);
  assert.equal($$('[data-unpay]').length, 0);
});

test('"Mark paid" only opens a form; nothing is recorded until you confirm', async () => {
  click($('[data-settle="0"]'));
  assert.ok($('#pform2'), 'payment form open');
  click($('#scrim [data-dismiss]'));
  assert.equal(owed(), 1, 'closing the form changes nothing');
});

test('recording shows Undo, which takes it straight back', async () => {
  click($('[data-settle="0"]')); submit($('#pform2'));
  assert.equal(owed(), 0, 'debt cleared');
  assert.match($('#toast').textContent, /Payment recorded/);
  click($('#toast button'));
  assert.equal(owed(), 1, 'Undo puts the debt back');
  assert.equal(P.run('expenses().filter(isPay).length'), 0);
});

test('a recorded payment shows as Paid and can be toggled off and on again', async () => {
  click($('[data-settle="0"]')); submit($('#pform2'));
  const t = $('[data-unpay]');
  assert.ok(t, 'Paid list shows the payment');
  assert.equal(t.getAttribute('aria-pressed'), 'true');
  click(t);
  assert.equal(owed(), 1, 'tapping ✓ Paid marks it not paid again');
  assert.equal($$('[data-unpay]').length, 0);
  assert.match($('#toast').textContent, /Marked as not paid/);
  click($('#toast button'));
  assert.equal(owed(), 0, 'Undo marks it paid again');
  assert.equal($$('[data-unpay]').length, 1);
});
