// Loads the real public/index.html in a headless browser so tests exercise the shipped code.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function load(opts = {}) {
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', url: 'https://test.workers.dev/', pretendToBeVisual: true,
    beforeParse(w) { w.fetch = opts.fetch || (() => Promise.reject(new Error('offline'))); w.scrollTo = () => {}; w.setInterval = () => 0;
      // give the test browser the same crypto/encoding/Blob support a real phone browser has
      const { webcrypto } = require('crypto');
      Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.TextEncoder = TextEncoder; w.TextDecoder = TextDecoder; w.Blob = Blob;
      w.URL.createObjectURL = b => { w.__lastBlob = b; return 'blob:test'; }; w.URL.revokeObjectURL = () => {};
    },
  });
  const w = dom.window;
  // copy results out of the browser as plain data so assertions compare values
  const run = code => { const r = w.eval(code); if (r && typeof r.then === 'function') return r; return r && typeof r === 'object' ? JSON.parse(w.JSON.stringify(r)) : r; };
  // Replace the open trip with a test trip. amounts are in pence.
  const trip = (people, expenses, extra = {}) => {
    w.__t = { v: 1, id: 'testtrip000000000000', name: 'T', cur: '€', nu: 0, u: 1,
      people: people.map((p, i) => typeof p === 'string' ? { id: p, name: p, c: i, u: 1 } : { c: i, u: 1, ...p }),
      expenses: expenses.map((e, i) => ({ id: 'e' + i, date: '2026-10-01', cat: 'other', u: 1, ...e })), ...extra };
    run('S=fix(__t)');
  };
  return { w, run, trip };
}

// A fake Cloudflare KV store and a fetch that sends the page's /api calls to the real worker.js
function kv() {
  const m = new Map(), ttl = new Map();
  return { m, ttl, get: async (k, o) => m.has(k) ? m.get(k) : null, put: async (k, v, o) => { m.set(k, v); ttl.set(k, o && o.expirationTtl); }, delete: async k => { m.delete(k); },
    list: async ({ prefix }) => ({ keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }) };
}
function workerFetch(worker, env) {
  return async (url, init = {}) => {
    const req = new Request(new URL(String(url), 'https://test.workers.dev/'), { method: init.method, headers: init.headers, body: init.body instanceof Blob ? await init.body.arrayBuffer() : init.body });
    const res = await worker.fetch(req, env);
    const body = await res.arrayBuffer();
    return { ok: res.ok, status: res.status, json: async () => JSON.parse(new TextDecoder().decode(body)), arrayBuffer: async () => body };
  };
}
const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
module.exports = { load, kv, workerFetch, tick };
