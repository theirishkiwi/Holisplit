// End-to-end encryption: the server only ever holds ciphertext, phones merge, and links carry the key.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { load, kv, workerFetch, tick } = require('./helpers.cjs');
const parts = link => link.split('#')[1].split('.');

async function setup() {
  const { default: worker } = await import(path.join(__dirname, '..', 'worker.js'));
  const env = { TRIPS: kv() };
  const fetch = workerFetch(worker, env);
  return { worker, env, fetch };
}
const addExp = (P, id, desc, amt, u) => P.run(`S.expenses.push({id:'${id}',desc:'${desc}',amt:${amt},date:'2026-10-05',paidBy:'p1',for:['p1','p2'],cat:'food',u:${u}});save()`);

test('new trips are encrypted: the server never sees names, amounts or the key', async () => {
  const { env, fetch } = await setup();
  const A = load({ fetch });
  try {
    await tick();
    A.run(`S=blank();S.name='Secret Family Trip';S.people.push({id:'p1',name:'Chris',c:0,u:1},{id:'p2',name:'Sam',c:1,u:1});save()`);
    addExp(A, 'x1', 'Pizza Napoli', 4321, 2);
    await A.run('sync()');
    const [id, key] = parts(A.run('tripLink()'));
    const stored = env.TRIPS.m.get('trip:' + id);
    const envl = JSON.parse(stored);
    assert.equal(envl.v, 2);
    for (const secret of ['Secret', 'Chris', 'Sam', 'Pizza', '4321', key]) assert.ok(!stored.includes(secret), `server copy leaks "${secret}"`);
  } finally { A.w.close(); }
});

test('a phone with the full link can read and edit; wrong or missing key cannot', async () => {
  const { env, fetch } = await setup();
  const A = load({ fetch }), B = load({ fetch }), C = load({ fetch });
  try {
    await tick();
    A.run(`S=blank();S.name='Fam';S.people.push({id:'p1',name:'Chris',c:0,u:1},{id:'p2',name:'Sam',c:1,u:1});save()`);
    addExp(A, 'x1', 'Dinner', 6000, 2);
    await A.run('sync()');
    const [id, key] = parts(A.run('tripLink()'));

    await C.run(`join('${id}')`);
    assert.notEqual(C.run('S.id'), id);
    assert.match(C.run("document.querySelector('#toast').textContent"), /missing its key/);
    const wrong = key.slice(0, -2) + (key.endsWith('AA') ? 'BB' : 'AA');
    await C.run(`join('${id}','${wrong}')`);
    assert.notEqual(C.run('S.id'), id);
    assert.match(C.run("document.querySelector('#toast').textContent"), /doesn't match/);

    // opening the link via the address bar works the same way
    B.run(`location.hash='#${id}.${key}';checkHash()`);
    await tick(80);
    assert.equal(B.run('S.id'), id);
    assert.equal(B.run('S.key'), key);
    assert.deepEqual(B.run('expenses().map(e=>e.desc)'), ['Dinner']);
  } finally { A.w.close(); B.w.close(); C.w.close(); }
});

test('two phones edit at the same time: both changes survive (conflict, merge, retry)', async () => {
  const { env, fetch } = await setup();
  // A's fetch can pause just before its first save so B can save in between: the exact race that causes a conflict
  let beforeAPut = null; const seen = [];
  const fetchA = async (u, i = {}) => {
    if (i.method === 'PUT' && beforeAPut) { const h = beforeAPut; beforeAPut = null; await h(); }
    const r = await fetch(u, i); if (String(u).includes('/trip/')) seen.push(`${i.method || 'GET'} ${r.status}`); return r;
  };
  const A = load({ fetch: fetchA }), B = load({ fetch });
  try {
    await tick();
    A.run(`S=blank();S.people.push({id:'p1',name:'Chris',c:0,u:1},{id:'p2',name:'Sam',c:1,u:1});save()`);
    await A.run('sync()');
    const [id, key] = parts(A.run('tripLink()'));
    await B.run(`join('${id}','${key}')`);
    await tick(700);                                   // let any background syncs finish
    addExp(B, 'b1', 'Taxi', 2500, 3);
    addExp(A, 'a1', 'Gelato', 900, 3);
    beforeAPut = () => B.run('sync()');                // B saves Taxi after A has read the trip
    seen.length = 0;
    await A.run('sync()');
    assert.ok(seen.includes('PUT 409'), `expected a conflict, saw: ${seen.join(', ')}`);
    assert.equal(seen.at(-1), 'PUT 200', 'A merged and saved on retry');
    await B.run('sync()');
    for (const P of [A, B]) assert.deepEqual(P.run('expenses().map(e=>e.desc).sort()'), ['Gelato', 'Taxi']);
    // a later edit wins over the older version on the other phone
    A.run(`const e=S.expenses.find(x=>x.id==='b1');e.amt=2600;e.u=9;save()`);
    await tick(700); await A.run('sync()'); await B.run('sync()');
    assert.equal(B.run(`S.expenses.find(x=>x.id==='b1').amt`), 2600);
  } finally { A.w.close(); B.w.close(); }
});

test('receipt photos are encrypted on the server and readable on another phone', async () => {
  const { env, fetch } = await setup();
  const A = load({ fetch }), B = load({ fetch });
  try {
    await tick();
    A.run(`S=blank();S.people.push({id:'p1',name:'Chris',c:0,u:1},{id:'p2',name:'Sam',c:1,u:1});save()`);
    const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]).toString('base64');
    A.run(`S.expenses.push({id:'x1',desc:'Hotel',amt:10000,date:'2026-10-05',paidBy:'p1',for:['p1','p2'],cat:'stay',photo:7,pe:1,u:2});queuePhoto('x1',7,'${jpeg}');save()`);
    await A.run('sync()'); await A.run('uploadPhotos()'); await tick(50);
    const [id, key] = parts(A.run('tripLink()'));
    const stored = new Uint8Array(env.TRIPS.m.get(`photo:${id}:x1`));
    assert.ok(stored.length > 9 && !(stored[0] === 0xff && stored[1] === 0xd8), 'server holds ciphertext, not a JPEG');
    await B.run(`join('${id}','${key}')`);
    await B.run(`photoURL('x1',7,1)`);
    const bytes = new Uint8Array(await B.run('__lastBlob.arrayBuffer()'));
    assert.deepEqual([...bytes], [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);
  } finally { A.w.close(); B.w.close(); }
});

test('worker: encrypted trips use revisions and cannot be downgraded', async () => {
  const { worker, env } = await setup();
  const id = 'e'.repeat(20), url = 'https://x/api/trip/' + id;
  const put = body => worker.fetch(new Request(url, { method: 'PUT', body: JSON.stringify(body) }), env);
  let r = await (await put({ v: 2, id, rev: 0, enc: 'AAAA' })).json();
  assert.equal(r.rev, 1);
  const stale = await put({ v: 2, id, rev: 0, enc: 'BBBB' });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).current.enc, 'AAAA');
  assert.equal((await put({ v: 1, id, people: [], expenses: [] })).status, 400, 'plain write over an encrypted trip refused');
  const p = await worker.fetch(new Request(`https://x/api/photo/${id}/x1`, { method: 'PUT', body: new Uint8Array([9, 9, 9]) }), env);
  assert.equal(p.status, 200, 'encrypted trips accept encrypted photos');
});
