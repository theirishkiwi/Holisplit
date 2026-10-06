// Readability / space changes: trip summary, quiet total, payer names, one-line settle rows,
// your payments first, folded sections, + only on Expenses, and the person menu.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers.cjs');

const P = load();
test.after(() => P.w.close());
const $ = s => P.w.document.querySelector(s), $$ = s => [...P.w.document.querySelectorAll(s)];
const click = el => el.dispatchEvent(new P.w.MouseEvent('click', { bubbles: true }));
const txt = el => el.textContent.replace(/\s+/g, ' ').trim();
function trip() {
  P.run(`S=blank();S.name='Tuscany';S.cur='€';
    [['c','Chris'],['a','Ashleigh'],['s','Sarah b.'],['l','Allan'],['j','Jo']].forEach(([id,n],i)=>S.people.push({id,name:n,c:i,u:1}));
    const all=['c','a','s','l','j'];let n=0;const E=(d,desc,amt,by,f=all)=>S.expenses.push({id:'e'+(n++),desc,amt,date:d,paidBy:by,for:f,cat:'food',u:n});
    E('2026-10-03','Pizza',18500,'s');E('2026-10-04','Lunch',13000,'l');E('2026-10-05','Gelato',2400,'j');E('2026-10-06','Coffee',1400,'c',['c','a']);
    prefs.me={[S.id]:'c'};prefs.couples=false;prefs.othersOpen=false;prefs.balOpen=false;tab='exp';save();open=new Set(['2026-10-06']);render()`);
}

test('trip summary under the title: date range and people', () => {
  trip();
  assert.equal($('#tripsub').textContent, '3–6 Oct · 5 people');
  P.run(`S.expenses.push({id:'z',desc:'Hotel',amt:100,date:'2026-11-02',paidBy:'c',for:['c'],cat:'stay',u:9});render()`);
  assert.equal($('#tripsub').textContent, '3 Oct – 2 Nov · 5 people');
  P.run(`S.expenses=[];render()`);
  assert.equal($('#tripsub').textContent, '5 people');
});

test('trip total is a quiet one-line label', () => {
  trip();
  assert.equal(txt($('.bar .tot')), 'Trip total €353.00');
});

test('each expense names who paid ("You" for this phone)', () => {
  trip();
  assert.match(txt($('[data-edit="e3"] .who')), /^You paid\s*·/);
  P.run(`open.add('2026-10-05');render()`);
  assert.match(txt($('[data-edit="e2"] .who')), /^Jo paid\s*·\s*everyone$/);
});

test('Settle up: your payments first on one line each; others folded; balances folded', () => {
  trip(); click($('[data-tab="bal"]'));
  const mine = $$('.srow');
  assert.ok(mine.length >= 1 && mine.every(r => [...r.querySelectorAll('.nm')].some(n => n.textContent === 'You')), 'only your rows shown');
  assert.ok(mine.every(r => r.querySelector('.acts') && r.querySelector('.amt')), 'amount and button on the same row');
  const fold = $('[data-fold="othersOpen"]');
  assert.match(txt(fold), /^Other payments \(\d+\)$/);
  click(fold);
  assert.ok($$('.srow').length > mine.length, 'others shown after tapping');
  assert.equal($$('#bal .card .row .who').filter(w => /^Paid /.test(txt(w))).length, 0, 'balances folded by default');
  click($('[data-fold="balOpen"]'));
  assert.equal($$('#bal .row .who').filter(w => /^Paid /.test(txt(w))).length, 5, 'balances open');
  assert.ok($('#bal #copy') && $('#bal .h2acts a.wa'), 'share icons by the heading');
});

test('the + button only shows on Expenses', () => {
  trip();
  assert.equal($('#add').hidden, false);
  click($('[data-tab="bal"]')); assert.equal($('#add').hidden, true);
  click($('[data-tab="ppl"]')); assert.equal($('#add').hidden, true);
});

test('Group: one row per person with You / couple / payment-details labels', () => {
  trip();
  P.run(`person('l').pair='j';person('j').pair='l';person('a').pay={monzo:'ash'};tab='ppl';render()`);
  assert.match(txt($('[data-person="c"]')), /Chris\s*You/);
  assert.match(txt($('[data-person="l"]')), /Couple with Jo/);
  assert.match(txt($('[data-person="a"]')), /Payment details/);
  assert.equal($$('[data-rm]').length, 0, 'no remove ✕ in the list');
});

test('person menu: set as me, pair, unpair', () => {
  trip(); P.run(`tab='ppl';render()`);
  click($('[data-person="a"]'));
  click($('#scrim [data-me="a"]'));
  assert.equal(P.run('me()'), 'a');
  assert.ok($('#scrim').hidden);
  click($('[data-person="s"]'));
  click($('#scrim [data-pairto="l"]'));
  assert.equal(P.run(`partner('s')`), 'l');
  click($('[data-person="s"]'));
  click($('#punpair'));
  assert.equal(P.run(`partner('s')`), null);
});

test('person menu: remove needs a second tap, has Undo, and is blocked while in expenses', () => {
  trip(); P.run(`S.people.push({id:'x',name:'Extra',c:6,u:1});tab='ppl';render()`);
  click($('[data-person="s"]'));
  assert.equal($('#prm').disabled, true, 'Sarah is in expenses');
  click($('[data-dismiss]'));
  click($('[data-person="x"]'));
  click($('#prm'));
  assert.ok(P.run(`!person('x').del`), 'first tap only arms');
  click($('#prm'));
  assert.ok(P.run(`!!S.people.find(p=>p.id==='x').del`));
  click($('#toast button'));
  assert.ok(P.run(`!S.people.find(p=>p.id==='x').del`), 'Undo brings them back');
});

test('Settle up rows: couples get two lines (full names, then amount + button); short single names stay on one line', () => {
  P.run(`S=blank();S.cur='€';[['c','Chris'],['l','Lou'],['r','Rob'],['a','Ashleigh']].forEach(([id,n],i)=>S.people.push({id,name:n,c:i,u:1}));
    person('c').pair='l';person('l').pair='c';person('r').pair='a';person('a').pair='r';
    S.expenses.push({id:'x',desc:'Villa',amt:40000,date:'2026-10-01',paidBy:'r',for:['c','l','r','a'],cat:'stay',u:1});
    prefs.me={[S.id]:'c'};prefs.couples=true;tab='bal';save();render()`);
  const row = $('.srow');
  assert.ok(row.classList.contains('two'), 'couple rows use two lines');
  assert.deepEqual([...row.querySelectorAll('.nm')].map(n => n.textContent), ['You & Lou', 'Rob & Ashleigh'], 'full names, not cut down');
  assert.ok(row.querySelector('.line2 .amt') && row.querySelector('.line2 .acts'), 'amount and button on the second line');
  P.run(`S=blank();S.cur='€';[['c','Chris'],['s','Sue']].forEach(([id,n],i)=>S.people.push({id,name:n,c:i,u:1}));
    S.expenses.push({id:'y',desc:'Taxi',amt:2000,date:'2026-10-01',paidBy:'s',for:['c','s'],cat:'transport',u:1});
    prefs.me={[S.id]:'c'};tab='bal';save();render()`);
  assert.ok(!$('.srow').classList.contains('two'), '"You → Sue" fits on one line');
});
