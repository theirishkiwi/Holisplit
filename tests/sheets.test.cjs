// Closing the expense / payment / settings screens: arrow, swipe down, back gesture.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, tick } = require('./helpers.cjs');

const P = load();
test.after(() => P.w.close());
const errors = []; P.w.addEventListener('error', e => errors.push(e.message));
const $ = sel => P.w.document.querySelector(sel);
const click = el => el.dispatchEvent(new P.w.MouseEvent('click', { bubbles: true }));
const isOpen = () => !$('#scrim').hidden;
function touch(el, type, y) {
  const ev = new P.w.Event(type, { bubbles: true });
  Object.defineProperty(ev, 'touches', { value: y == null ? [] : [{ clientY: y }] });
  el.dispatchEvent(ev);
}
async function swipe(el, dy, ms) { touch(el, 'touchstart', 100); await tick(ms); touch(el, 'touchmove', 100 + dy); touch(el, 'touchend'); await tick(250); }
const openExpense = async () => { click($('#add')); await tick(); assert.ok(isOpen()); };

test('every sheet has a grab handle and a close arrow', async () => {
  await openExpense();
  assert.ok($('#scrim .sheet .grab'), 'grab handle');
  assert.ok($('#scrim [data-dismiss]'), 'close arrow');
  click($('#scrim [data-dismiss]'));
  assert.ok(!isOpen(), 'arrow closes it');
  click($('#gear')); await tick();
  assert.ok($('#scrim .sheet .grab') && $('#sclose'));
  click($('#sclose')); assert.ok(!isOpen());
});

test('a swipe down on the top bar closes; a short or slow drag springs back', async () => {
  await openExpense();
  await swipe($('#scrim .sh h3'), 40, 300);
  assert.ok(isOpen(), 'short slow drag does not close');
  assert.equal($('#scrim .sheet').style.transform, '', 'springs back');
  await swipe($('#scrim .sh h3'), 140, 120);
  assert.ok(!isOpen(), 'long drag closes');
  await openExpense();
  await swipe($('#scrim .grab'), 50, 20);
  assert.ok(!isOpen(), 'quick flick closes');
});

test('dragging inside the form fields does not close the sheet', async () => {
  await openExpense();
  await swipe($('#famt'), 200, 50);
  assert.ok(isOpen());
  click($('#scrim [data-dismiss]'));
});

test('closing straight after opening does not crash', async () => {
  click($('#add')); click($('#scrim [data-dismiss]'));
  await tick(150);
  assert.deepEqual(errors, []);
});

test('the phone back gesture closes the sheet, and closing does not eat the next sheet', async () => {
  await tick(450);                                   // let earlier closes finish their history step
  await openExpense();
  assert.equal(P.w.history.state && P.w.history.state.sheet, 1, 'sheet adds a history step');
  P.w.dispatchEvent(new P.w.PopStateEvent('popstate', { state: null }));
  assert.ok(!isOpen(), 'back closes it');
  // close then immediately open another: the pending history step must not close the new one
  await openExpense();
  click($('#scrim [data-dismiss]'));
  await openExpense();
  await tick(150);
  assert.ok(isOpen(), 'new sheet stays open');
});
