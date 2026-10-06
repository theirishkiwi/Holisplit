// Duplicate checks: asks before saving something that looks already added, and flags existing pairs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, tick } = require('./helpers.cjs');

const ppl = ['c', 's'];
const E = (id, desc, amt, date, extra = {}) => ({ id, desc, amt, date, paidBy: 'c', for: ppl, ...extra });
const setup = (expenses) => {
  const P = load(); P.trip(ppl, []);
  P.run(`S.expenses=${JSON.stringify(expenses.map(e => ({ cat: 'other', u: 1, ...e })))};prefs.me={[S.id]:'c'};render()`);
  return P;
};
const $ = (P, s) => P.w.document.querySelector(s);
const click = (P, s) => P.run(`document.querySelector(${JSON.stringify(s)}).click()`);
const fill = (P, amt, desc, date) => P.run(`(()=>{const a=document.querySelector('#famt');a.value=${JSON.stringify(amt)};a.oninput();
  const d=document.querySelector('#fdesc');d.value=${JSON.stringify(desc)};d.oninput({target:d});
  ${date ? `const t=document.querySelector('#fdate');t.value='${date}';t.oninput();` : ''}})()`);
const submit = P => P.run(`document.querySelector('#eform').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);

test('rules: same amount and shop within 2 days, same amount same day, same shop same day; generic words, payments and "not duplicate" ignored', () => {
  const P = setup([
    E('a', 'Eurospin', 3300, '2026-10-01'),
    E('pay', 'Payment', 3300, '2026-10-01', { type: 'pay', for: ['s'] }),
  ]);
  try {
    const why = c => P.run(`dupReason(${JSON.stringify({ id: 'x', ...c })},S.expenses.find(e=>e.id==='a'))`);
    assert.equal(why({ desc: 'EUROSPIN Italia', amt: 3300, date: '2026-10-02' }), 'Same amount and shop');
    assert.equal(why({ desc: 'Groceries', amt: 3300, date: '2026-10-01' }), 'Same amount, same day');
    assert.equal(why({ desc: 'Groceries', amt: 3300, date: '2026-10-02' }), '', 'same amount on another day is normal (two €12 gelatos)');
    assert.equal(why({ desc: 'Eurospin', amt: 3300, date: '2026-10-05' }), '', 'too far apart');
    assert.equal(why({ desc: 'Eurospín', amt: 1250, date: '2026-10-01' }), 'Same shop, same day', 'accents ignored');
    assert.equal(why({ desc: 'Eurospin', amt: 1250, date: '2026-10-02' }), '', 'different amount, different day');
    assert.equal(P.run(`dupReason({id:'x',desc:'Dinner',amt:1,date:'2026-10-01'},{id:'y',desc:'Dinner',amt:2,date:'2026-10-01'})`), '', '"Dinner" twice in a day is normal');
    assert.equal(why({ desc: 'Groceries', amt: 3300, date: '2026-10-01', notdup: ['a'] }), '', 'remembered as not a duplicate');
    assert.equal(P.run(`findDups({id:'x',desc:'x',amt:3300,date:'2026-10-01'}).map(d=>d.e.id).join()`), 'a', 'payments never flagged');
    assert.equal(P.run(`dupReason({id:'x',desc:'Hotel',amt:10000,date:'2026-10-01',cc:'£',oamt:8600},{id:'y',desc:'Room',amt:10050,date:'2026-10-01',cc:'£',oamt:8600})`), 'Same amount, same day', 'same foreign amount, different rate');
  } finally { P.w.close(); }
});

test('adding a duplicate asks first: "Don\'t add" keeps it out, "Add anyway" saves and stops asking', async () => {
  const P = setup([E('a', 'Eurospin', 3300, '2026-10-01')]);
  try {
    click(P, '#add'); fill(P, '33', 'Eurospin', '2026-10-01'); submit(P);
    assert.equal($(P, '#duppanel').hidden, false, 'asks');
    assert.match($(P, '#duppanel').textContent, /Possible duplicate.*Eurospin.*same amount and shop/s);
    assert.equal(P.run('S.expenses.length'), 1, 'not saved yet');
    click(P, '#dupNo');
    assert.equal(P.run('S.expenses.length'), 1, "Don't add");
    assert.equal($(P, '#eform'), null, 'form closed');

    click(P, '#add'); fill(P, '33', 'Eurospin', '2026-10-01'); submit(P);
    click(P, '#dupYes'); await tick();
    assert.equal(P.run('S.expenses.length'), 2, 'Add anyway');
    const n = P.run('S.expenses.at(-1)');
    assert.deepEqual(n.notdup, ['a']);
    assert.equal(P.run('dupPairs().length'), 0, 'not flagged again');
  } finally { P.w.close(); }
});

test('changing the amount after the prompt checks again; edits only check when something relevant changed', async () => {
  const P = setup([E('a', 'Eurospin', 3300, '2026-10-01'), E('b', 'Taxi', 3300, '2026-10-05')]);
  try {
    click(P, '#add'); fill(P, '33', 'Ferry', '2026-10-01'); submit(P);
    assert.equal($(P, '#duppanel').hidden, false);
    fill(P, '18', 'Ferry', '2026-10-01');
    assert.equal($(P, '#duppanel').hidden, true, 'prompt goes away when you fix it');
    submit(P);
    assert.equal(P.run('S.expenses.length'), 3, 'no longer a match, saved straight away');

    P.run(`open=new Set(['2026-10-01','2026-10-02','2026-10-05']);render()`);
    click(P, '[data-edit="b"]');
    P.run(`document.querySelector('[data-for="s"]').click()`); submit(P);
    assert.equal(P.run(`S.expenses.find(e=>e.id==='b').for.join()`), 'c', 'split change saves without asking');
    click(P, '[data-edit="b"]'); fill(P, '33', 'Taxi', '2026-10-01'); submit(P);
    assert.equal($(P, '#duppanel').hidden, false, 'moving it next to a same-amount expense asks');
    assert.match($(P, '#dupNo').textContent, /Cancel/);
    assert.match($(P, '#dupYes').textContent, /Save anyway/);
  } finally { P.w.close(); }
});

test('existing duplicates: Expenses shows a review notice; "Not duplicates" syncs, Delete can be undone', async () => {
  const P = setup([
    E('a', 'Eurospin', 3300, '2026-10-01'), E('b', 'Eurospin', 3300, '2026-10-01', { u: 5 }),
    E('c', 'Gelato', 900, '2026-10-02'), E('d', 'Gelato', 900, '2026-10-02'),
  ]);
  try {
    P.run(`tab='exp';render()`);
    assert.match($(P, '#dupReview').textContent, /2 possible duplicates/);
    click(P, '#dupReview');
    assert.equal(P.w.document.querySelectorAll('.duppair').length, 2);
    P.run(`[...document.querySelectorAll('.duppair')].find(p=>/Eurospin/.test(p.textContent)).querySelector('[data-notdup]').click()`);
    const b = P.run(`S.expenses.find(e=>e.id==='b')`);
    assert.deepEqual(b.notdup, ['a'], 'remembered on the newer one');
    assert.ok(b.u > 5, 'bumped so it syncs to everyone');
    assert.equal(P.w.document.querySelectorAll('.duppair').length, 1, 'list refreshes');
    click(P, '[data-dupdel="d"]');
    assert.equal(P.run(`S.expenses.find(e=>e.id==='d').del`) ? 1 : 0, 1, 'deleted');
    assert.equal($(P, '#dupReview'), null, 'notice gone');
    P.run(`[...document.querySelectorAll('button')].find(b=>/Undo/.test(b.textContent)).click()`);
    assert.ok(!P.run(`S.expenses.find(e=>e.id==='d').del`), 'undo restores it');
  } finally { P.w.close(); }
});
