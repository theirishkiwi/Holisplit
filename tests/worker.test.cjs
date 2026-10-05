const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const env = () => { const m = new Map(); return { m, TRIPS: { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } } }; };
const id = 'abcdefghijklmnop1234';
const base = { v: 1, id, name: 'Trip', cur: '€', nu: 1, u: 1, people: [{ id: 'p1', name: 'A', u: 1 }], expenses: [{ id: 'e1', amt: 100, u: 1 }] };

test('worker merge: concurrent edits from two phones are combined, newest wins', async () => {
  const { default: w } = await import(path.join(__dirname, '..', 'worker.js'));
  const e = env(), call = (method, body) => w.fetch(new Request('https://x/api/trip/' + id, { method, body: body && JSON.stringify(body) }), e);
  assert.equal((await call('GET')).status, 404);
  await call('PUT', base);
  await call('PUT', { ...base, expenses: [{ id: 'e1', amt: 100, u: 1 }, { id: 'e2', amt: 200, u: 2 }] });
  const r = await (await call('PUT', { ...base, expenses: [{ id: 'e1', amt: 150, u: 3 }, { id: 'e3', amt: 300, u: 3 }] })).json();
  assert.deepEqual(r.expenses.map(x => `${x.id}:${x.amt}`), ['e1:150', 'e2:200', 'e3:300']);
  const stale = await (await call('PUT', { ...base, expenses: [{ id: 'e1', amt: 100, del: true, u: 2 }] })).json();
  assert.ok(!stale.expenses[0].del, 'an older delete loses to a newer edit');
  assert.equal((await call('PUT', { ...base, id: 'zzzzzzzzzzzzzzzzzzzz' })).status, 400, 'body id must match the URL');
});

test('worker photos: only JPEGs, valid ids', async () => {
  const { default: w } = await import(path.join(__dirname, '..', 'worker.js'));
  const e = env(), url = `https://x/api/photo/${id}/e1`;
  assert.equal((await w.fetch(new Request(url, { method: 'PUT', body: new Uint8Array([0xff, 0xd8, 0xff, 0]) }), e)).status, 200);
  assert.equal((await w.fetch(new Request(url), e)).headers.get('content-type'), 'image/jpeg');
  assert.equal((await w.fetch(new Request(url, { method: 'PUT', body: new Uint8Array([1, 2, 3]) }), e)).status, 400);
  assert.equal((await w.fetch(new Request('https://x/api/photo/short/e1'), e)).status, 400);
});
