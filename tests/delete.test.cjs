// Deleting a trip: always confirmed first, restorable for 30 days, then gone.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { load, kv, workerFetch, tick } = require('./helpers.cjs');
const parts = link => link.split('#')[1].split('.');
const DAY = 864e5, YEAR_S = 60 * 60 * 24 * 365, MONTH_S = 60 * 60 * 24 * 30;
const click = (P, sel) => P.run(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
const until = async (fn, ms = 3000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timed out'); await tick(30); } };

async function twoPhones() {
  const { default: worker } = await import(path.join(__dirname, '..', 'worker.js'));
  const env = { TRIPS: kv() }, fetch = workerFetch(worker, env);
  const A = load({ fetch }), B = load({ fetch });
  await tick();
  A.run(`S=blank();S.name='Tuscany';S.people.push({id:'p1',name:'Chris',c:0,u:1},{id:'p2',name:'Sam',c:1,u:1});
         S.expenses.push({id:'x1',desc:'Pizza',amt:4000,date:'2026-10-05',paidBy:'p1',for:['p1','p2'],cat:'food',u:2});save()`);
  await A.run('sync()');
  const [id, key] = parts(A.run('tripLink()'));
  await B.run(`join('${id}','${key}')`);
  await tick(700);
  return { env, A, B, id, key };
}

test('delete for everyone: needs two confirmations, reaches the other phone, and can be restored', async () => {
  const { env, A, B, id } = await twoPhones();
  try {
    click(A, '#gear'); click(A, '#sdel');
    assert.ok(A.run("!!document.querySelector('#dall')"), 'confirmation sheet shown');
    click(A, '#dall');
    assert.match(A.run("document.querySelector('#dall').textContent"), /Tap again/);
    assert.equal(A.run('!!S.del'), false, 'nothing deleted after the first tap');
    click(A, '#dall');
    await until(() => A.run('S.id') !== id);
    assert.ok(A.run(`prefs.trips.find(t=>t.id==='${id}').del`), 'A lists it as deleted');
    assert.equal(env.TRIPS.ttl.get('trip:' + id), MONTH_S, 'server keeps a deleted trip for 30 days');

    await B.run('sync()');
    assert.ok(B.run('S.del'), 'B sees the deletion');
    assert.equal(B.run("document.querySelector('#deleted').hidden"), false);
    assert.match(B.run("document.querySelector('#delText').textContent"), /Chris deleted this trip|Deleted this trip/);
    assert.equal(B.run("document.querySelector('#add').hidden"), true);

    // B restores from the banner
    click(B, '#restoreBtn');
    await tick(700); await B.run('sync()');
    assert.equal(B.run('!!S.del'), false);
    assert.equal(env.TRIPS.ttl.get('trip:' + id), YEAR_S, 'restored trip is kept for a year again');
    // A gets it back from Recently deleted, with its expenses intact
    click(A, '#gear');
    assert.ok(A.run(`!!document.querySelector('[data-restore="${id}"]')`), 'shown under Recently deleted');
    click(A, `[data-restore="${id}"]`);
    await tick(100); await A.run('sync()');
    assert.equal(A.run('S.id'), id);
    assert.equal(A.run('!!S.del'), false);
    assert.deepEqual(A.run('expenses().map(e=>e.desc)'), ['Pizza']);
  } finally { A.w.close(); B.w.close(); }
});

test('remove from this phone: the group keeps the trip; restore or reopening the link brings it back', async () => {
  const { env, A, B, id, key } = await twoPhones();
  try {
    click(B, '#gear'); click(B, '#sdel'); click(B, '#dlocal');
    assert.notEqual(B.run('S.id'), id);
    assert.ok(B.run(`prefs.trips.find(t=>t.id==='${id}').local`));
    assert.ok(!JSON.parse(env.TRIPS.m.get('trip:' + id)).del, 'server copy untouched');
    // undo from the toast
    click(B, '#toast button');
    assert.equal(B.run('S.id'), id);
    // remove again, then reopen the invite link
    click(B, '#gear'); click(B, '#sdel'); click(B, '#dlocal');
    await B.run(`join('${id}','${key}')`);
    assert.equal(B.run('S.id'), id);
    assert.equal(B.run(`prefs.trips.find(t=>t.id==='${id}').local`), null);
    assert.deepEqual(B.run('expenses().map(e=>e.desc)'), ['Pizza']);
  } finally { A.w.close(); B.w.close(); }
});

test('after 30 days a deleted trip is cleared from the phone', async () => {
  const P = load();
  try {
    P.run(`S=blank();S.name='Old';persist();const id=S.id;
           const t=prefs.trips.find(x=>x.id===id);t.del=Date.now()-31*${DAY};
           const keep=blank();keep.name='Recent';S=keep;persist();prefs.trips.find(x=>x.id===keep.id).local=Date.now()-29*${DAY};savePrefs();
           window.__old=id;window.__recent=keep.id;purgeDeleted()`);
    assert.equal(P.run('localStorage.getItem("hs-trip-"+__old)'), null, '31-day-old trip removed');
    assert.ok(P.run('!!localStorage.getItem("hs-trip-"+__recent)'), '29-day-old trip still restorable');
    assert.equal(P.run('daysLeft(prefs.trips.find(x=>x.id===__recent))'), 1);
  } finally { P.w.close(); }
});

test('delete for everyone is refused offline (nothing half-deleted)', async () => {
  const P = load();
  try {
    P.run(`S=blank();S.name='Trip';persist()`);
    await P.run('deleteForEveryone()');
    assert.equal(P.run('!!S.del'), false);
    assert.match(P.run("document.querySelector('#toast').textContent"), /needs a connection/);
  } finally { P.w.close(); }
});

test('worker: deleting a plain trip shortens its storage to 30 days; restoring puts it back to a year', async () => {
  const { default: worker } = await import(path.join(__dirname, '..', 'worker.js'));
  const env = { TRIPS: kv() }, id = 'd'.repeat(20);
  const put = b => worker.fetch(new Request('https://x/api/trip/' + id, { method: 'PUT', body: JSON.stringify(b) }), env);
  const base = { v: 1, id, name: 'T', people: [], expenses: [], nu: 1, u: 1 };
  await put(base);
  let r = await (await put({ ...base, del: 5, delBy: 'p1', du: 5 })).json();
  assert.equal(r.del, 5); assert.equal(env.TRIPS.ttl.get('trip:' + id), MONTH_S);
  r = await (await put({ ...base, del: 9, du: 4 })).json();
  assert.equal(r.del, 5, 'an older delete/restore loses to the newer one');
  r = await (await put({ ...base, del: null, du: 6 })).json();
  assert.equal(r.del, null); assert.equal(env.TRIPS.ttl.get('trip:' + id), YEAR_S);
});
