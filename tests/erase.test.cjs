// Delete permanently: only after typing DELETE; erases the server copy and photos; no phone can bring it back.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { load, kv, workerFetch, tick } = require('./helpers.cjs');
const parts = link => link.split('#')[1].split('.');
const click = (P, sel) => P.run(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new MouseEvent('click',{bubbles:true}))`);
const type = (P, v) => P.run(`const b=document.querySelector('#erasebox');b.value=${JSON.stringify(v)};b.dispatchEvent(new Event('input'))`);
const submit = P => P.run(`document.querySelector('#eraseform').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
const until = async (fn, ms = 3000) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timed out'); await tick(30); } };

async function setup() {
  const { default: worker } = await import(path.join(__dirname, '..', 'worker.js'));
  const env = { TRIPS: kv() }, fetch = workerFetch(worker, env);
  const A = load({ fetch }), B = load({ fetch });
  await tick();
  A.run(`S=blank();S.name='Lisbon';S.people.push({id:'p1',name:'Chris',c:0,u:1},{id:'p2',name:'Sam',c:1,u:1});
         S.expenses.push({id:'x1',desc:'Hotel',amt:20000,date:'2026-10-05',paidBy:'p1',for:['p1','p2'],cat:'stay',photo:3,pe:1,u:2});save()`);
  await A.run('sync()');
  const [id, key] = parts(A.run('tripLink()'));
  env.TRIPS.m.set(`photo:${id}:x1`, new Uint8Array([1, 2, 3]).buffer);
  await B.run(`join('${id}','${key}')`);
  await tick(700);
  return { worker, env, A, B, id };
}

test('Delete permanently stays disabled until DELETE is typed', async () => {
  const { A, B, id } = await setup();
  try {
    await A.run('deleteForEveryone()');
    click(A, '#gear');
    click(A, `[data-erase="${id}"]`);
    assert.equal(A.run("document.querySelector('#erasego').disabled"), true);
    for (const v of ['', 'del', 'delete it', 'DELET']) {
      type(A, v); assert.equal(A.run("document.querySelector('#erasego').disabled"), true, `"${v}" must not enable it`);
      submit(A); assert.ok(A.run(`!!loadTrip('${id}')`), `"${v}" must not delete`);
    }
    type(A, ' Delete ');
    assert.equal(A.run("document.querySelector('#erasego').disabled"), false, 'any case, spaces trimmed');
  } finally { A.w.close(); B.w.close(); }
});

test('deleted for everyone, then deleted permanently: server copy and photos erased, every phone drops it', async () => {
  const { env, A, B, id } = await setup();
  try {
    await A.run('deleteForEveryone()');
    click(A, '#gear'); click(A, `[data-erase="${id}"]`); type(A, 'DELETE'); submit(A);
    await until(() => A.run(`!loadTrip('${id}')`));
    assert.ok(!A.run(`prefs.trips.some(t=>t.id==='${id}')`), 'gone from Recently deleted');
    assert.equal(env.TRIPS.m.get('trip:' + id), '{"erased":true}', 'server keeps only an "erased" marker');
    assert.ok(![...env.TRIPS.m.keys()].some(k => k.startsWith(`photo:${id}:`)), 'photos erased');

    // B still has its old copy open: next sync finds it erased and drops it
    assert.equal(B.run('S.id'), id);
    await B.run('sync()');
    assert.notEqual(B.run('S.id'), id);
    assert.equal(B.run(`localStorage.getItem('hs-trip-${id}')`), null);
    assert.match(B.run("document.querySelector('#toast').textContent"), /permanently deleted/);

    // an old copy elsewhere cannot bring it back
    const put = await A.run(`fetch('/api/trip/${id}',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({v:2,id:'${id}',rev:0,enc:'AAAA'})}).then(r=>r.status)`);
    assert.equal(put, 410);
  } finally { A.w.close(); B.w.close(); }
});

test('a trip only removed from this phone is erased locally; the group keeps it', async () => {
  const { env, A, B, id } = await setup();
  try {
    click(B, '#gear'); click(B, '#sdel'); click(B, '#dlocal');
    click(B, '#gear'); click(B, `[data-erase="${id}"]`);
    assert.match(B.run("document.querySelector('.warnbox').textContent"), /group's copy isn't affected/);
    type(B, 'delete'); submit(B);
    await until(() => B.run(`!loadTrip('${id}')`));
    assert.ok(JSON.parse(env.TRIPS.m.get('trip:' + id)).v === 2, 'server copy untouched');
    await A.run('sync()');
    assert.equal(A.run('S.id'), id, 'A still has the trip');
  } finally { A.w.close(); B.w.close(); }
});

test('refused if someone restored it in the meantime', async () => {
  const { env, A, B, id } = await setup();
  try {
    await A.run('deleteForEveryone()');
    await B.run('sync()');
    B.run(`restoreTrip('${id}')`); await tick(700); await B.run('sync()');   // B restores before A erases
    await A.run(`eraseTrip('${id}')`);
    assert.match(A.run("document.querySelector('#toast').textContent"), /restored/);
    assert.ok(!JSON.parse(env.TRIPS.m.get('trip:' + id)).erased, 'not erased');
  } finally { A.w.close(); B.w.close(); }
});

test('worker: only a trip already deleted for everyone can be erased', async () => {
  const { default: worker } = await import(path.join(__dirname, '..', 'worker.js'));
  const env = { TRIPS: kv() }, id = 'f'.repeat(20), url = 'https://x/api/trip/' + id;
  const call = (method, body) => worker.fetch(new Request(url, { method, body: body && JSON.stringify(body) }), env);
  assert.equal((await call('DELETE')).status, 404);
  await call('PUT', { v: 2, id, rev: 0, enc: 'AAAA' });
  assert.equal((await call('DELETE')).status, 409, 'live trip cannot be erased');
  await call('PUT', { v: 2, id, rev: 1, enc: 'BBBB', del: 123 });
  assert.equal((await call('DELETE')).status, 200);
  const g = await call('GET');
  assert.equal(g.status, 410);
  assert.equal((await g.json()).error, 'erased');
});

test('erasing needs a connection when the server copy must go', async () => {
  const P = load();
  try {
    P.run(`S=blank();S.name='Trip';S.del=Date.now();S.du=S.del;persist();window.__id=S.id`);
    await P.run('eraseTrip(__id)');
    assert.ok(P.run('!!loadTrip(__id)'), 'kept');
    assert.match(P.run("document.querySelector('#toast').textContent"), /needs a connection/);
  } finally { P.w.close(); }
});
