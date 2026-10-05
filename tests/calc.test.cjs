const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');
const { w, run, trip } = load();
test.after(() => w.close());

const nets = () => run('Object.fromEntries(plan().nets.map(x=>[x.u.ids.join("+"),x.n]))');
const transfers = () => run('plan().t.map(([f,t,m])=>[f.ids.join("+"),t.ids.join("+"),m])');
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);

// Seeded random so failures are reproducible
let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = a => a[Math.floor(rnd() * a.length)];

test('equal split adds up exactly and the payer absorbs the odd pennies', () => {
  trip(['a', 'b', 'c'], []);
  const sh = run('shares({amt:1000,paidBy:"b",for:["a","b","c"]})');
  assert.deepEqual(sh, { b: 334, a: 333, c: 333 });
  const sh2 = run('shares({amt:1001,paidBy:"z",for:["a","b","c"]})');
  assert.equal(sum(sh2), 1001);
});

test('one-person split: the payer covers it all', () => {
  trip(['a', 'b'], [{ amt: 500, paidBy: 'a', for: ['b'] }]);
  assert.deepEqual(nets(), { a: 500, b: -500 });
  assert.deepEqual(transfers(), [['b', 'a', 500]]);
});

test('worked example: 4 people, mixed payers', () => {
  trip(['chris', 'sam', 'alex', 'jo'], [
    { amt: 8640, paidBy: 'chris', for: ['chris', 'sam', 'alex', 'jo'] },
    { amt: 6000, paidBy: 'alex', for: ['chris', 'alex'] },
  ]);
  // chris: paid 86.40, share 21.60+30.00 = 51.60 → +34.80; alex: paid 60, share 21.60+30 → +8.40
  assert.deepEqual(nets(), { chris: 3480, sam: -2160, alex: 840, jo: -2160 });
});

test('random trips: balances always sum to zero and settling clears every debt', () => {
  for (let k = 0; k < 400; k++) {
    const n = 2 + Math.floor(rnd() * 8), ids = Array.from({ length: n }, (_, i) => 'p' + i);
    const ex = Array.from({ length: Math.floor(rnd() * 25) }, () => {
      const f = ids.filter(() => rnd() < 0.6); if (!f.length) f.push(pick(ids));
      return { amt: 1 + Math.floor(rnd() * 50000), paidBy: pick(ids), for: f };
    });
    // random couples
    const ppl = ids.map(id => ({ id, name: id }));
    for (let i = 0; i + 1 < n; i += 2) if (rnd() < 0.5) { ppl[i].pair = ppl[i + 1].id; ppl[i + 1].pair = ppl[i].id; }
    trip(ppl, ex);
    for (const mode of [true, false]) {
      run(`prefs.couples=${mode}`);
      const b = nets(), t = transfers();
      assert.equal(sum(b), 0, 'nets must sum to zero');
      const left = { ...b };
      for (const [f, to, m] of t) {
        assert.ok(m > 0 && Number.isInteger(m), 'transfer is a positive whole number of cents');
        assert.notEqual(f, to, 'no self transfers');
        left[f] += m; left[to] -= m;
      }
      assert.ok(Object.values(left).every(v => v === 0), 'everyone is square after the transfers');
      assert.ok(t.length <= Math.max(0, Object.keys(b).length - 1), 'at most units-1 transfers');
    }
  }
});

test('couples settle as one unit and need fewer transfers', () => {
  trip([{ id: 'c', name: 'Chris', pair: 's' }, { id: 's', name: 'Sam', pair: 'c' }, { id: 'a', name: 'Alex', pair: 'j' }, { id: 'j', name: 'Jo', pair: 'a' }, { id: 'k', name: 'Kim' }], [
    { amt: 10000, paidBy: 'c', for: ['c', 's', 'a', 'j', 'k'] },
    { amt: 5000, paidBy: 'a', for: ['c', 's', 'a', 'j', 'k'] },
    { amt: 2500, paidBy: 'k', for: ['c', 's', 'a', 'j', 'k'] },
  ]);
  run('prefs.couples=true');
  assert.deepEqual(nets(), { 'c+s': 3000, 'a+j': -2000, k: -1000 });
  assert.equal(transfers().length, 2);
  run('prefs.couples=false');
  assert.equal(transfers().length, 4);
});

test('a one-sided pairing is ignored', () => {
  trip([{ id: 'a', name: 'A', pair: 'b' }, { id: 'b', name: 'B' }], []);
  assert.equal(run('hasCouples()'), false);
});

test('recording the suggested payments leaves everyone square', () => {
  trip(['a', 'b', 'c'], [{ amt: 9000, paidBy: 'a', for: ['a', 'b', 'c'] }, { amt: 1234, paidBy: 'b', for: ['b', 'c'] }]);
  const t = transfers();
  run(`S.expenses.push(...${JSON.stringify(t.map(([f, to, m], i) => ({ id: 'pay' + i, type: 'pay', amt: m, paidBy: f, for: [to], date: '2026-10-02', cat: 'other', u: 2 })))})`);
  assert.deepEqual(transfers(), []);
  assert.ok(Object.values(nets()).every(v => v === 0));
});

test('a part payment reduces the debt by exactly that amount', () => {
  trip(['a', 'b'], [{ amt: 8000, paidBy: 'a', for: ['b'] }, { type: 'pay', amt: 5000, paidBy: 'b', for: ['a'] }]);
  assert.deepEqual(transfers(), [['b', 'a', 3000]]);
});

test('payments are excluded from spending totals', () => {
  trip(['a', 'b'], [{ amt: 8000, paidBy: 'a', for: ['a', 'b'] }, { type: 'pay', amt: 4000, paidBy: 'b', for: ['a'] }]);
  assert.equal(run('spend().reduce((s,e)=>s+e.amt,0)'), 8000);
});

test('deleted expenses do not count', () => {
  trip(['a', 'b'], [{ amt: 8000, paidBy: 'a', for: ['b'], del: true }]);
  assert.deepEqual(transfers(), []);
});

test('an expense that still names a removed person keeps the books balanced', () => {
  // can happen when one phone removes Bob while another adds an expense for him
  trip([{ id: 'a', name: 'A' }, { id: 'b', name: 'B', del: true }], [{ amt: 1000, paidBy: 'a', for: ['a', 'b'] }]);
  assert.equal(sum(nets()), 0);
});

test('an expense with nobody in the split does not break the maths', () => {
  trip(['a', 'b'], [{ amt: 1000, paidBy: 'a', for: [] }]);
  assert.ok(Object.values(nets()).every(Number.isFinite));
  assert.equal(sum(nets()), 0);
});

test('amount entry: dots, commas and thousands separators', () => {
  const cases = { '12.50': 1250, '12,50': 1250, '7': 700, '€ 7.5': 750, '0.01': 1, '1.234,56': 123456, '1,234.56': 123456, '1 200': 120000, '1200,5': 120050 };
  for (const [txt, want] of Object.entries(cases)) assert.equal(run(`toPence(${JSON.stringify(txt)})`), want, txt);
  assert.ok(Number.isNaN(run('toPence("abc")')));
});

test('foreign currency converts to whole cents', () => {
  trip(['a', 'b'], [{ amt: Math.round(5100 * 1.17), cc: '£', oamt: 5100, rate: 1.17, paidBy: 'a', for: ['a', 'b'] }]);
  // 51.00 x 1.17 = 59.67; split 2 ways the payer takes the odd cent: a's share 29.84, b's 29.83
  assert.deepEqual(nets(), { a: 2983, b: -2983 });
});

test('"you" lines on each expense', () => {
  trip(['a', 'b', 'c'], [
    { amt: 900, paidBy: 'a', for: ['a', 'b', 'c'] },
    { amt: 900, paidBy: 'b', for: ['a', 'b', 'c'] },
    { amt: 900, paidBy: 'b', for: ['b', 'c'] },
    { amt: 900, paidBy: 'a', for: ['a'] },
  ]);
  run('prefs.me={[S.id]:"a"}');
  const lines = run('S.expenses.map(e=>myLine(e).replace(/<[^>]+>/g,""))');
  assert.deepEqual(lines, ['you lent €6.00', 'you owe €3.00', 'not involved', 'your share']);
});

test('dates use the phone\'s local day, not UTC (00:30 in Italy is still today)', () => {
  // Run with TZ=Europe/Rome (see package.json): 00:30 local is 22:30 UTC the previous day
  assert.equal(run('ymd(new Date(2026, 9, 5, 0, 30))'), '2026-10-05');
  const d = new Date();
  assert.equal(run('today()'), `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
});
