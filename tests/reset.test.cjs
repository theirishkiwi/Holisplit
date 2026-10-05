// Two phones and the real Worker: resetting the invite link turns off the old link without losing anyone's changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { load, kv, workerFetch, tick } = require('./helpers.cjs');
// split an invite link into [id, key]
const parts = link => link.split('#')[1].split('.');

test('reset invite link: old link stops working, nobody loses changes', async () => {
  const { default: worker } = await import(path.join(__dirname, '..', 'worker.js'));
  const env = { TRIPS: kv() };
  const fetch = workerFetch(worker, env);
  const A = load({ fetch }), B = load({ fetch });
  try {
    await tick();
    // Phone A starts a trip with two people and an expense, and syncs it
    A.run(`S=blank();delete S.key;delete S.pk;S.name='Family';S.people.push({id:'p1',name:'Chris',c:0,u:1},{id:'p2',name:'Sam',c:1,u:1});
           S.expenses.push({id:'x1',desc:'Dinner',amt:6000,date:'2026-10-05',paidBy:'p1',for:['p1','p2'],cat:'food',u:2});save()`);
    await A.run('sync()');
    const oldId = A.run('S.id');
    assert.ok(env.TRIPS.m.has('trip:' + oldId), 'trip saved on the server');

    // Phone B joins with the invite link
    await B.run(`join(${JSON.stringify(oldId)})`);
    assert.equal(B.run('S.id'), oldId);
    assert.equal(B.run('expenses().length'), 1);

    // A has a receipt photo stored under the old trip
    env.TRIPS.m.set(`photo:${oldId}:x1`, new Uint8Array([0xff, 0xd8, 0xff]).buffer);

    // A resets the link
    await A.run('resetLink()');
    const newId = A.run('S.id'), [linkId, linkKey] = parts(A.run('tripLink()'));
    assert.notEqual(newId, oldId);
    assert.equal(linkId, newId);
    assert.equal(linkKey.length, 43, 'new link carries the key');
    assert.ok(!env.TRIPS.m.get('trip:' + newId).includes('Dinner'), 'reset trip is encrypted on the server');
    assert.equal(A.run('S.prev'), oldId);
    assert.equal(env.TRIPS.m.get('trip:' + oldId), '{"revoked":true}', 'old link turned off');
    assert.ok(env.TRIPS.m.has(`photo:${newId}:x1`) && !env.TRIPS.m.has(`photo:${oldId}:x1`), 'photo moved');
    assert.ok(!A.run(`JSON.stringify(prefs.trips)`).includes(oldId), 'old trip removed from A\'s list');

    // Someone with only the old link gets nothing
    const C = load({ fetch });
    await C.run(`join(${JSON.stringify(oldId)})`);
    assert.notEqual(C.run('S.id'), oldId, 'old link opens nothing');
    assert.match(C.run("document.querySelector('#toast').textContent"), /not found|link/i);
    C.w.close();

    // B adds an expense, then tries to sync: told the link was reset, keeps the change locally
    B.run(`S.expenses.push({id:'x2',desc:'Taxi',amt:2000,date:'2026-10-05',paidBy:'p2',for:['p1','p2'],cat:'transport',u:5});save()`);
    await B.run('sync()');
    assert.equal(B.run('S.revoked'), true);
    assert.equal(B.run("document.querySelector('#revoked').hidden"), false, 'B sees the reset notice');
    assert.equal(B.run('syncOn()'), false);

    // B opens the new link: their Taxi carries over and syncs to A
    await B.run(`join(${JSON.stringify(newId)},${JSON.stringify(linkKey)})`);
    assert.equal(B.run('S.id'), newId);
    assert.deepEqual(B.run('expenses().map(e=>e.desc).sort()'), ['Dinner', 'Taxi']);
    assert.equal(B.run(`localStorage.getItem('hs-trip-${oldId}')`), null, 'old copy removed from B');
    await tick(600); await B.run('sync()');
    await A.run('sync()');
    assert.deepEqual(A.run('expenses().map(e=>e.desc).sort()'), ['Dinner', 'Taxi']);
  } finally { A.w.close(); B.w.close(); }
});

test('worker: move refuses a new trip that does not continue the old one', async () => {
  const { default: worker } = await import(path.join(__dirname, '..', 'worker.js'));
  const env = { TRIPS: kv() }, a = 'a'.repeat(20), b = 'b'.repeat(20);
  env.TRIPS.m.set('trip:' + a, JSON.stringify({ v: 1, id: a, people: [], expenses: [] }));
  env.TRIPS.m.set('trip:' + b, JSON.stringify({ v: 1, id: b, people: [], expenses: [] }));
  const r = await worker.fetch(new Request(`https://x/api/trip/${a}/move`, { method: 'POST', body: JSON.stringify({ to: b }) }), env);
  assert.equal(r.status, 400);
  assert.notEqual(env.TRIPS.m.get('trip:' + a), '{"revoked":true}', 'someone else\'s trip is untouched');
});
