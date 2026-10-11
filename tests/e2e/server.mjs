// A local stand-in for Cloudflare: serves public/ and sends /api/* to the real worker.js,
// with in-memory storage, a fake receipt-reading AI and fake exchange rates. Nothing leaves the machine.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };

export function memoryKV() {
  const m = new Map();
  return { m,
    get: async (k, o) => { if (!m.has(k)) return null; const v = m.get(k); return o && (o.type === 'arrayBuffer' || o === 'arrayBuffer') && typeof v !== 'string' ? v : v; },
    put: async (k, v) => { m.set(k, typeof v === 'string' ? v : v instanceof ArrayBuffer ? v : await new Response(v).arrayBuffer()); },
    delete: async k => { m.delete(k); },
    list: async ({ prefix }) => ({ keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete: true }) };
}

// receipt reader: always reads the same Eurospin receipt
export const fakeAI = (reply = '{"total":"29,69","currency":"EUR","date":null,"merchant":"EUROSPIN","what":"Groceries","type":"supermarket"}') => ({
  run: async (model, input) => input.prompt === 'agree' ? { response: 'ok' } : { response: reply, usage: { prompt_tokens: 3000, completion_tokens: 50 } },
});

// daily rates by currency pair; the worker asks Frankfurter, which we answer here
export const RATES = { 'eur/gbp': 0.8476, 'gbp/eur': 1.1798 };
function stubFrankfurter() {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const m = u.match(/^https:\/\/api\.frankfurter\.dev\/v2\/rate\/([a-z]{3})\/([a-z]{3})(?:\?date=([\d-]+))?/);
    if (m) {
      const rate = RATES[`${m[1]}/${m[2]}`];
      if (!rate) return new Response('{"message":"unknown"}', { status: 422 });
      return new Response(JSON.stringify({ date: m[3] || new Date().toISOString().slice(0, 10), base: m[1].toUpperCase(), quote: m[2].toUpperCase(), rate }));
    }
    return real(url, init);
  };
  return () => { globalThis.fetch = real; };
}

export async function startServer({ ai = fakeAI() } = {}) {
  const { default: worker } = await import(path.join(ROOT, 'worker.js'));
  const env = { TRIPS: memoryKV(), AI: ai };
  const unstub = stubFrankfurter();
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const chunks = []; for await (const c of req) chunks.push(c);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const r = await worker.fetch(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
        res.writeHead(r.status, Object.fromEntries(r.headers));
        res.end(Buffer.from(await r.arrayBuffer()));
        return;
      }
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (file.includes('..')) { res.writeHead(400); return res.end(); }
      const data = await readFile(path.join(ROOT, 'public', file));
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      res.writeHead(e.code === 'ENOENT' ? 404 : 500); res.end(String(e.message || e));
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://localhost:${server.address().port}/`;
  return { url, env, close: () => { unstub(); return new Promise(r => server.close(r)); } };
}
