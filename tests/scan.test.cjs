// Receipt scanning: Workers AI is simulated, so these tests cost nothing and run offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { load, kv, workerFetch, tick } = require('./helpers.cjs');

const W = () => import(path.join(__dirname, '..', 'worker.js'));
const TODAY = new Date().toISOString().slice(0, 10);
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const ddmmyyyy = iso => iso.split('-').reverse().join('/');
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

// a fake Workers AI: first call says the licence isn't accepted, like a brand-new account
function fakeAI(reply) {
  const calls = []; let agreed = false;
  return { calls, run: async (model, input) => {
    calls.push({ model, input });
    if (input.prompt === 'agree') { agreed = true; return { response: 'Thank you for agreeing' }; }
    if (!agreed) throw new Error('5016: Prior to using this model, you must submit the prompt "agree"');
    if (reply instanceof Error) throw reply;
    return { response: typeof reply === 'function' ? reply() : reply, usage: { prompt_tokens: 3300, completion_tokens: 60 } };
  } };
}

test('parseScan: reads messy model replies and rejects nonsense', async () => {
  const { parseScan } = await W();
  const p = t => parseScan(t, TODAY);
  const r = p('```json\n{"total":"33,00","currency":"EUR","date":"' + ddmmyyyy(daysAgo(1)) + '","merchant":"EUROSPIN ITALIA","type":"Supermarket"}\n```');
  assert.deepEqual(r, { total: 33, cur: '€', date: daysAgo(1), merchant: 'EUROSPIN ITALIA', cat: 'groceries' });
  assert.equal(p('{"total":1234.5,"type":"Café"}').cat, 'drinks');
  assert.equal(p('{"total":"1.234,50","type":"restaurant"}').total, 1234.5);
  assert.equal(p('{"total":12,"currency":"GBP","type":"spaceship"}').cur, '£');
  assert.equal(p('{"total":12,"type":"spaceship"}').cat, 'other');
  assert.equal(p('{"total":12,"date":"31/02/2026"}').date, null, 'impossible date');
  assert.equal(p(`{"total":12,"date":"${daysAgo(-5)}"}`).date, null, 'future date');
  assert.equal(p('{"total":-4}'), null, 'nothing usable');
  assert.equal(p('I cannot read this receipt'), null);
});

test('worker /api/scan: accepts the licence once, returns total, date, type; counts towards a daily cap', async () => {
  const { default: worker } = await W();
  const ai = fakeAI(`{"total":"27,40","currency":"EUR","date":"${daysAgo(3)}","merchant":"Bar Centrale","type":"cafe"}`);
  const env = { TRIPS: kv(), AI: ai }, id = 'k'.repeat(20);
  env.TRIPS.m.set('trip:' + id, JSON.stringify({ v: 2, id, rev: 1, enc: 'x' }));
  const scan = () => worker.fetch(new Request('https://x/api/scan/' + id, { method: 'POST', body: JPEG }), env);
  const r = await scan();
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.deepEqual({ total: j.total, cur: j.cur, date: j.date, cat: j.cat, merchant: j.merchant }, { total: 27.4, cur: '€', date: daysAgo(3), cat: 'drinks', merchant: 'Bar Centrale' });
  assert.ok(ai.calls.some(c => c.input.prompt === 'agree'), 'licence accepted automatically');
  const call = ai.calls.at(-1);
  assert.equal(call.model, '@cf/meta/llama-3.2-11b-vision-instruct');
  assert.match(call.input.image, /^data:image\/jpeg;base64,/, 'image as a data URL, like Cloudflare\'s example');
  assert.deepEqual(call.input.messages.map(m => m.role), ['system', 'user'], 'system + user message (3030 without)');
  assert.ok(call.input.max_tokens <= 300, 'short answer keeps cost down');
  assert.ok(![...env.TRIPS.m.keys()].some(k => k.startsWith('photo:')), 'photo not stored');
  env.TRIPS.m.set(`scan:${id}:${TODAY}`, '100');
  assert.equal((await scan()).status, 429, 'daily cap per trip');
});

test('worker /api/scan: refuses unknown or erased trips, non-JPEGs, and reports AI problems', async () => {
  const { default: worker } = await W();
  const id = 'q'.repeat(20);
  const call = (env, body = JPEG, tid = id) => worker.fetch(new Request('https://x/api/scan/' + tid, { method: 'POST', body }), env);
  const env = { TRIPS: kv(), AI: fakeAI('{"total":5}') };
  assert.equal((await call(env)).status, 404, 'trip must exist');
  env.TRIPS.m.set('trip:' + id, '{"erased":true}');
  assert.equal((await call(env)).status, 410);
  env.TRIPS.m.set('trip:' + id, JSON.stringify({ v: 1, id, people: [], expenses: [] }));
  assert.equal((await call(env, new Uint8Array([1, 2, 3]))).status, 400, 'JPEG only');
  assert.equal((await call({ TRIPS: env.TRIPS })).status, 503, 'no AI binding');
  assert.equal((await call({ TRIPS: env.TRIPS, AI: fakeAI(new Error('quota')) })).status, 503);
  assert.equal((await call({ TRIPS: env.TRIPS, AI: fakeAI('sorry, blurry') })).status, 422);
  const ping = await (await worker.fetch(new Request('https://x/api/ping'), env)).json();
  assert.equal(ping.scan, true);
});

async function phone(reply) {
  const { default: worker } = await W();
  const ai = fakeAI(reply), env = { TRIPS: kv(), AI: ai }, P = load({ fetch: workerFetch(worker, env) });
  await tick(60);
  P.run(`compress=async()=>'data:image/jpeg;base64,/9j/4AAQ';                // no canvas in the test browser
    S=blank();S.name='Tuscany';S.cur='€';S.people.push({id:'c',name:'Chris',c:0,u:1},{id:'s',name:'Sam',c:1,u:1});prefs.me={[S.id]:'c'};save()`);
  await P.run('sync()');
  return { P, ai, env };
}
const $ = (P, s) => P.w.document.querySelector(s);
const photo = P => P.run(`document.querySelector('#fphoto').onchange({target:{files:[new Blob(['x'],{type:'image/jpeg'})]}})`);

test('scan fills the form: total, older date, shop name and type; saved on the receipt\'s day', async () => {
  const { P } = await phone(`{"total":"33,00","currency":"EUR","date":"${daysAgo(2)}","merchant":"EUROSPIN","type":"supermarket"}`);
  try {
    P.run(`document.querySelector('#add').click()`);
    await photo(P); await tick(50);
    assert.equal($(P, '#famt').value, '33.00');
    assert.equal($(P, '#fdate').value, daysAgo(2), 'older receipt gets its own day');
    assert.equal($(P, '#fdesc').value, 'Eurospin', 'shouty receipt names tidied');
    assert.match($(P, '#catbtn').getAttribute('style') || '', /background/, 'category chosen');
    assert.match($(P, '#scanmsg').textContent, /Filled from receipt: €33\.00 · .* · Eurospin · Groceries/);
    P.run(`document.querySelector('#eform').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
    const e = P.run(`S.expenses.at(-1)`);
    assert.deepEqual([e.amt, e.date, e.cat, e.desc, !!e.photo], [3300, daysAgo(2), 'groceries', 'Eurospin', true]);
  } finally { P.w.close(); }
});

test('scan never overwrites what you typed, and offers the receipt total instead', async () => {
  const { P } = await phone(`{"total":48.5,"currency":"EUR","date":"${daysAgo(1)}","merchant":"Trattoria Da Mario","type":"restaurant"}`);
  try {
    P.run(`document.querySelector('#add').click()`);
    P.run(`const a=document.querySelector('#famt');a.value='45';a.oninput();const d=document.querySelector('#fdesc');d.value='Dinner';d.oninput({target:d})`);
    await photo(P); await tick(50);
    assert.equal($(P, '#famt').value, '45', 'typed amount kept');
    assert.equal($(P, '#fdesc').value, 'Dinner', 'typed description kept');
    assert.equal($(P, '#fdate').value, daysAgo(1), 'untouched date still filled');
    assert.ok($(P, '#useTotal'), 'offers the receipt total');
    P.run(`document.querySelector('#useTotal').click()`);
    assert.equal($(P, '#famt').value, '48.50');
  } finally { P.w.close(); }
});

test('a £ receipt on a € trip switches the currency; a bad photo just says so', async () => {
  let reply = `{"total":51,"currency":"GBP","type":"supermarket"}`;
  const { P } = await phone(() => reply);
  try {
    P.run(`prefs.rates={'£':1.17};document.querySelector('#add').click()`);
    await photo(P); await tick(50);
    assert.equal($(P, '#ccbtn').textContent, '£');
    assert.equal($(P, '#frate').value, '1.17');
    assert.match($(P, '#conv').textContent, /€59\.67/);
    P.run(`document.querySelector('[data-dismiss]').click()`);
    reply = 'too blurry';
    P.run(`document.querySelector('#add').click()`);
    await photo(P); await tick(50);
    assert.match($(P, '#scanmsg').textContent, /Couldn't read the receipt/);
    assert.equal($(P, '#famt').value, '');
  } finally { P.w.close(); }
});

test('turning "Read receipt photos" off attaches the photo without scanning', async () => {
  const { P, ai } = await phone('{"total":9}');
  try {
    P.run(`prefs.scan=false;document.querySelector('#add').click()`);
    const before = ai.calls.length;
    await photo(P); await tick(50);
    assert.equal(ai.calls.length, before, 'no AI call');
    assert.equal($(P, '#scanmsg').hidden, true);
  } finally { P.w.close(); }
});

test('scanning a receipt that is already in the trip warns straight away', async () => {
  const { P } = await phone(`{"total":"33,00","currency":"EUR","date":"${daysAgo(2)}","merchant":"EUROSPIN","type":"supermarket"}`);
  try {
    P.run(`S.expenses.push({id:'old',desc:'Eurospin',amt:3300,date:'${daysAgo(2)}',paidBy:'s',for:['c','s'],cat:'groceries',u:1});save()`);
    P.run(`document.querySelector('#add').click()`);
    await photo(P); await tick(50);
    assert.match($(P, '#scanmsg').textContent, /Looks like Eurospin €33\.00 .* Sam paid\. Check it isn't a duplicate/);
  } finally { P.w.close(); }
});

test('worker /api/scan: copes with object replies, broken JSON, and image-format refusals; explains failures', async () => {
  const { default: worker, scanText } = await W();
  const id = 'r'.repeat(20);
  const env = reply => { const e = { TRIPS: kv(), AI: reply }; e.TRIPS.m.set('trip:' + id, JSON.stringify({ v: 2, id, rev: 1, enc: 'x' })); return e; };
  const call = async e => { const r = await worker.fetch(new Request('https://x/api/scan/' + id, { method: 'POST', body: JPEG }), e); return [r.status, await r.json()]; };
  // reply already parsed into an object
  let [st, j] = await call(env({ run: async () => ({ response: { total: 65.9, currency: 'EUR', merchant: 'Vasari Cafe', type: 'cafe' } }) }));
  assert.equal(st, 200); assert.equal(j.total, 65.9); assert.equal(j.cat, 'drinks');
  // Italian decimal comma makes invalid JSON
  [st, j] = await call(env({ run: async () => ({ response: '{"total": 65,90, "currency": "EUR", "merchant": "Vasari Cafe", "type": "cafe"}' }) }));
  assert.equal(st, 200); assert.equal(j.total, 65.9, 'not 6590');
  // the format is refused (e.g. 3030): tries the next way of attaching the image
  const seen = [];
  [st, j] = await call(env({ run: async (m, inp) => {
    const kind = inp.image ? (Array.isArray(inp.image) ? 'bytes' : 'dataurl') : 'image_url';
    seen.push(kind);
    if (kind !== 'bytes') throw new Error('3030: Unable to add image when there are no user-supplied nor system-supplied messages.');
    return { response: '{"total":9}' };
  } }));
  assert.equal(st, 200); assert.deepEqual(seen, ['dataurl', 'image_url', 'bytes']);
  [st, j] = await call(env({ run: async () => { throw new Error('3030: nope'); } }));
  assert.equal(st, 503); assert.match(j.detail, /3030: nope \| 3030: nope/, 'all attempts reported');
  // failures say why
  [st, j] = await call(env({ run: async () => ({ response: 'The image is too blurry to read.' }) }));
  assert.equal(st, 422); assert.match(j.detail, /too blurry/);
  [st, j] = await call(env({ run: async () => { throw new Error('3036: account limited'); } }));
  assert.equal(st, 503); assert.match(j.detail, /account limited/);
  assert.equal(scanText({ result: { response: 'hi' } }), 'hi');
});

test('the app shows the reason when a scan fails', async () => {
  const { P } = await phone('The image is too blurry to read.');
  try {
    P.run(`document.querySelector('#add').click()`);
    await photo(P); await tick(50);
    assert.match($(P, '#scanmsg').textContent, /Couldn't read the receipt.*Read: The image is too blurry/s);
  } finally { P.w.close(); }
});
