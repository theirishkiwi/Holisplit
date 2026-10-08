// Help guide, What's new, and the About line with the GitHub link.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load, tick } = require('./helpers.cjs');

const seed = prefs => w => {
  const id = 'helptrip000000000001';
  w.localStorage.setItem('hs-trip-' + id, JSON.stringify({ v: 1, id, name: 'Tuscany', cur: '€', nu: 1, u: 1, people: [{ id: 'c', name: 'Chris', c: 0, u: 1 }], expenses: [] }));
  w.localStorage.setItem('holiday-split-prefs', JSON.stringify({ sync: true, cur: id, trips: [{ id, name: 'Tuscany' }], ...prefs }));
};
const ui = P => ({
  $: s => P.w.document.querySelector(s), $$: s => [...P.w.document.querySelectorAll(s)],
  click: el => el.dispatchEvent(new P.w.MouseEvent('click', { bubbles: true })),
  txt: el => el.textContent.replace(/\s+/g, ' ').trim(),
});

test('Settings: Help, What\'s new, and an About line linking to the GitHub repo', async () => {
  const P = load(); const { $, $$, click, txt } = ui(P);
  try {
    click($('#gear'));
    const a = $('.about a');
    assert.equal(a.getAttribute('href'), 'https://github.com/theirishkiwi/Holisplit');
    assert.equal(a.getAttribute('target'), '_blank');
    assert.match(txt($('.about')), /Holiday Split · Open source on GitHub\s*Updated \d+ \w+ 20\d\d/);
    click($('#shelp')); await tick(10);
    const sections = $$('details.help summary').map(txt);
    assert.deepEqual(sections, ['Getting started', 'Adding expenses', 'Receipt photos', 'Couples and joint accounts', 'Settling up', 'Offline', 'Privacy and deleting']);
    assert.equal($$('details.help')[0].open, true, 'first section open');
    assert.match(txt($$('details.help')[4]), /Amounts in €.*settle in another currency/);
  } finally { P.w.close(); }
});

test('an empty trip offers "How it works"', async () => {
  const P = load(); const { $, click } = ui(P);
  try {
    P.run(`S=blank();S.dirty=false;tab='exp';render()`);
    assert.ok($('[data-help]'), 'shown when there are no people yet');
    click($('[data-help]'));
    assert.ok($('details.help'), 'guide opened');
  } finally { P.w.close(); }
});

test('What\'s new: returning users see a one-line banner after an update; See opens the list and it stays dismissed', async () => {
  const P = load({ before: seed({ news: '2026-01-01' }) }); const { $, $$, click, txt } = ui(P);
  try {
    assert.equal($('#news').hidden, false);
    assert.match(txt($('#newsText')), new RegExp('^New: ' + P.run('NEWS[0].head').replace(/[£,]/g, '.')));
    click($('#newsSee'));
    assert.equal($('#news').hidden, true);
    assert.equal(P.run('prefs.news'), P.run('LATEST'));
    assert.ok($$('.newsl li').length >= 3, 'list of changes');
    assert.match(txt($('.newsd')), /\d+ \w+/);
  } finally { P.w.close(); }
  const P2 = load({ before: seed({ news: '2026-01-01' }) }); const u2 = ui(P2);
  try {
    u2.click(u2.$('#newsX'));
    assert.equal(u2.$('#news').hidden, true);
    assert.equal(P2.run('JSON.parse(localStorage.getItem("holiday-split-prefs")).news'), P2.run('LATEST'), 'remembered');
  } finally { P2.w.close(); }
});

test('What\'s new: someone who used the app before this feature existed sees it once; a brand-new user never does', async () => {
  const P = load({ before: seed({}) }); const { $ } = ui(P);
  try { assert.equal($('#news').hidden, false, 'existing user, no record yet'); } finally { P.w.close(); }
  const N = load(); const n = ui(N);
  try {
    assert.equal(n.$('#news').hidden, true, 'first time: nothing is "new"');
    assert.equal(N.run('prefs.news'), N.run('LATEST'));
  } finally { N.w.close(); }
  const S = load({ before: seed({ news: '2099-01-01' }) }); const s = ui(S);
  try { assert.equal(s.$('#news').hidden, true, 'already seen'); } finally { S.w.close(); }
});

test('NEWS is newest first with real dates', () => {
  const P = load();
  try {
    const d = P.run('NEWS.map(n=>n.d)');
    assert.deepEqual([...d].sort().reverse(), d);
    d.forEach(x => assert.match(x, /^\d{4}-\d{2}-\d{2}$/));
    assert.equal(P.run('LATEST'), d[0]);
  } finally { P.w.close(); }
});
