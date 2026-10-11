// Edit clashes: someone else changes the expense you're editing, or two people change it at the same time offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, tick } = require('./helpers.cjs');

function phone() {
  const P = load();
  P.run(`S=blank();S.name='Tuscany';S.cur='€';S.people.push({id:'c',name:'Chris',c:0,u:1},{id:'l',name:'Leanne',c:1,u:1});
    S.expenses.push({id:'x',desc:'Dinner',amt:9000,date:'2026-10-01',paidBy:'c',for:['c','l'],cat:'food',u:100});
    prefs.me={[S.id]:'c'};tab='exp';open=new Set(['2026-10-01']);render()`);
  const $ = s => P.w.document.querySelector(s);
  const txt = s => $(s).textContent.replace(/\s+/g, ' ').trim();
  return { P, $, txt };
}
const theirs = (over = {}) => JSON.stringify({ people: [], expenses: [{ id: 'x', desc: 'Dinner', amt: 9600, date: '2026-10-01', paidBy: 'c', for: ['c', 'l'], cat: 'food', u: 200, pu: 100, eb: 'l', ...over }],
  log: [{ id: 'q1', t: 200, by: 'l', k: 'e', a: 'edit', i: 'x', d: 'Dinner', m: 9600, x: ['amount €90.00 → €96.00'] }] });

test('while you edit, Leanne changes the same expense: the form says what changed, and you can use theirs', async () => {
  const { P, $, txt } = phone();
  try {
    P.run(`document.querySelector('[data-edit="x"]').click()`);
    P.run(`document.querySelector('#fdesc').value="Dinner at Gina's"`);
    assert.equal($('#clash').hidden, true);
    P.run(`mergeIn(${theirs()})`);
    assert.equal($('#clash').hidden, false);
    assert.match(txt('#clash'), /Leanne just changed this expense: amount €90\.00 → €96\.00\. If you save, your version replaces theirs\./);
    P.run(`document.querySelector('#useTheirs').click()`); await tick(80);
    assert.equal($('#famt').value, '96.00', 'reopened with their version');
    assert.equal($('#clash').hidden, true);
  } finally { P.w.close(); }
});

test('saving anyway keeps yours, and records which version it started from', () => {
  const { P, $ } = phone();
  try {
    P.run(`document.querySelector('[data-edit="x"]').click()`);
    P.run(`mergeIn(${theirs()})`);
    P.run(`(()=>{const a=document.querySelector('#famt');a.value='90';a.oninput()})()`);
    P.run(`document.querySelector('#eform').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
    const e = P.run(`S.expenses.find(e=>e.id==='x')`);
    assert.equal(e.amt, 9000);
    assert.equal(e.pu, 100, 'started from the version opened, not Leanne\'s');
    assert.equal(e.eb, 'c');
  } finally { P.w.close(); }
});

test('Leanne deletes it while you edit: you\'re told, and saving brings it back', () => {
  const { P, $, txt } = phone();
  try {
    P.run(`document.querySelector('[data-edit="x"]').click()`);
    P.run(`mergeIn(${theirs({ amt: 9000, del: true })})`);
    assert.match(txt('#clash'), /Leanne just deleted this expense\. If you save, it comes back/);
    P.run(`document.querySelector('#eform').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
    assert.equal(P.run(`S.expenses.find(e=>e.id==='x').del`), false);
  } finally { P.w.close(); }
});

test('two edits made apart (e.g. offline): both people are told whose version was kept', () => {
  // you changed it (from version 100) but haven't synced; Leanne also changed it from version 100, later
  const a = phone();
  try {
    a.P.run(`Object.assign(S.expenses[0],{amt:8000,u:150,pu:100,eb:'c'})`);
    a.P.run(`mergeIn(${theirs()})`);
    assert.match(a.txt('#toast'), /Leanne changed Dinner at the same time as you\. Their version was kept\./);
    assert.equal(a.P.run(`S.expenses[0].amt`), 9600);
  } finally { a.P.w.close(); }
  // Leanne's phone: her later edit meets yours
  const b = phone();
  try {
    b.P.run(`prefs.me={[S.id]:'l'};Object.assign(S.expenses[0],{amt:9600,u:200,pu:100,eb:'l'})`);
    b.P.run(`mergeIn(${theirs({ amt: 8000, u: 150, eb: 'c' })})`);
    assert.match(b.txt('#toast'), /Chris changed Dinner at the same time as you\. Your version was kept\./);
  } finally { b.P.w.close(); }
  // no warning for a normal edit made from the latest version
  const c = phone();
  try {
    c.P.run(`Object.assign(S.expenses[0],{u:150,pu:100,eb:'c'})`);
    c.P.run(`mergeIn(${theirs({ pu: 150 })})`);
    assert.equal(c.$('#toast').hidden, true);
  } finally { c.P.w.close(); }
});
