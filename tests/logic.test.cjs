// The money maths on its own: src/js/core.js and src/js/money.js run in plain Node, with no browser page.
// Quick to run and easy to read; the browser tests check the same rules through the screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'src', 'js');
function logic() {
  const ctx = vm.createContext({ crypto: globalThis.crypto, S: null, syncAvail: false });
  vm.runInContext(['core', 'money'].map(f => fs.readFileSync(path.join(SRC, f + '.js'), 'utf8')).join('\n'), ctx);
  const run = code => vm.runInContext(code, ctx);
  // a trip: people by name (id = lower-case name), expenses as {amt, paidBy, for}
  const trip = (names, exps, extra = {}) => {
    ctx.__t = { id: 't', name: 'T', cur: '€', people: names.map((n, i) => ({ id: n.toLowerCase(), name: n, c: i, u: 1 })),
      expenses: exps.map((e, i) => ({ id: 'e' + i, date: '2026-10-01', desc: 'x', u: 1, ...e })), ...extra };
    run('S=fix(__t)');
  };
  return { run, trip, ctx };
}
const plain = x => JSON.parse(JSON.stringify(x));

test('an equal split: leftover pennies go to the payer first, then in list order', () => {
  const { run } = logic();
  assert.deepEqual(plain(run(`shares({amt:1000,paidBy:'b',for:['a','b','c']})`)), { b: 334, a: 333, c: 333 });
  assert.deepEqual(plain(run(`shares({amt:1001,paidBy:'z',for:['a','b','c']})`)), { a: 334, b: 334, c: 333 });
  assert.deepEqual(plain(run(`shares({amt:500,paidBy:'a',for:[]})`)), { a: 500 }, 'nobody ticked: all on the payer');
});

test('balances and the fewest payments to settle', () => {
  const { run, trip } = logic();
  trip(['Chris', 'Leanne', 'Sara'], [
    { amt: 9000, paidBy: 'chris', for: ['chris', 'leanne', 'sara'] },
    { amt: 3000, paidBy: 'leanne', for: ['leanne', 'sara'] },
  ]);
  const b = plain(run('balances()'));
  assert.deepEqual(b, { chris: { paid: 9000, share: 3000 }, leanne: { paid: 3000, share: 4500 }, sara: { paid: 0, share: 4500 } });
  const t = plain(run('plan().t.map(([f,to,m])=>[uName(f),uName(to),m])'));
  assert.deepEqual(t, [['Sara', 'Chris', 4500], ['Leanne', 'Chris', 1500]]);
});

test('a couple settles as one; a joint couple never owes each other', () => {
  const { run, trip } = logic();
  trip(['Chris', 'Leanne', 'David'], [{ amt: 6000, paidBy: 'leanne', for: ['chris', 'leanne', 'david'] }]);
  run(`S.people[0].pair='leanne';S.people[1].pair='chris'`);
  assert.deepEqual(plain(run('plan().t.map(([f,to,m])=>[uName(f),uName(to),m])')), [['David', 'Chris & Leanne', 2000]]);
  assert.equal(run(`isJoint('chris')`), false);
  run(`S.people[0].joint=S.people[1].joint=true`);
  assert.equal(run(`isJoint('chris')`), true);
});

test('typed amounts: commas or points, thousands, currency signs', () => {
  const { run } = logic();
  for (const [v, p] of [['12.50', 1250], ['12,50', 1250], ['1.234,56', 123456], ['1,234.56', 123456], ['1 200', 120000], ['€7', 700], ['abc', NaN]])
    assert.ok(Object.is(run(`toPence(${JSON.stringify(v)})`), p), `${v} → ${p}`);
});

test('settle-up currency: trip amounts shown and paid in £ at the trip\'s rate', () => {
  const { run, trip } = logic();
  trip(['Chris', 'Sara'], [], { sx: { cc: '£', rate: 0.8476, mode: 'manual' } });
  assert.equal(run('sAmt(3000)'), 2543);
  assert.equal(run('fromS(2543)'), 3000);
  assert.equal(run('smoney(3000)'), '£25.43');
  assert.equal(run('rateTxt()'), '€1 = £0.8476');
});

test('uneven split by shares: 2 shares costs twice 1 share, pennies still add up', () => {
  const { run } = logic();
  assert.deepEqual(plain(run(`shares({amt:12000,paidBy:'c',for:['c','l','d','s'],split:{m:'s',w:{c:2,l:1,d:1,s:1}}})`)), { c: 4800, l: 2400, d: 2400, s: 2400 });
  const odd = plain(run(`shares({amt:1000,paidBy:'a',for:['a','b'],split:{m:'s',w:{a:1,b:2}}})`));
  assert.deepEqual(odd, { a: 333, b: 667 }, 'the penny goes to whoever lost most in rounding');
});

test('uneven split by amount: each pays exactly what was typed; in another currency, in proportion', () => {
  const { run } = logic();
  assert.deepEqual(plain(run(`shares({amt:12000,paidBy:'c',for:['c','l','d','s'],split:{m:'a',w:{c:5000,l:3000,d:2000,s:2000}}})`)), { c: 5000, l: 3000, d: 2000, s: 2000 });
  // €100 typed as €70 + €30, the expense worth £85 on a £ trip
  assert.deepEqual(plain(run(`shares({amt:8500,cc:'€',oamt:10000,paidBy:'c',for:['c','l'],split:{m:'a',w:{c:7000,l:3000}}})`)), { c: 5950, l: 2550 });
  // never more or less than the total, whatever the numbers
  for (let amt = 1; amt < 400; amt += 37) {
    const sh = run(`shares({amt:${amt},paidBy:'a',for:['a','b','c'],split:{m:'s',w:{a:3,b:5,c:7}}})`);
    assert.equal(Object.values(sh).reduce((s, v) => s + v, 0), amt);
  }
});

test('an older or broken split falls back to equal rather than losing money', () => {
  const { run } = logic();
  assert.deepEqual(plain(run(`shares({amt:900,paidBy:'a',for:['a','b','c'],split:{m:'s',w:{}}})`)), { a: 300, b: 300, c: 300 });
  assert.deepEqual(plain(run(`shares({amt:900,paidBy:'a',for:['a','b','c'],split:null})`)), { a: 300, b: 300, c: 300 });
  assert.equal(run(`tooNew({lv:2})`), false);
  assert.equal(run(`tooNew({lv:3})`), true, 'made by a newer version');
});
