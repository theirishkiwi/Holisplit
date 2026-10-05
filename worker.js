// Holiday Split sync API. Static files in ./public are served automatically;
// this Worker only handles /api/*. Each trip is one JSON value in KV, keyed by its random id.
const TRIP_ID = /^[a-z0-9]{12,40}$/;
const ITEM_ID = /^[A-Za-z0-9_-]{2,40}$/;
const MAX_BYTES = 512 * 1024;
const MAX_PHOTO = 3 * 1024 * 1024;
const KEEP_FOR = 60 * 60 * 24 * 365; // a trip is removed a year after its last change
const H = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: H });

// Keep only the fields the app uses
function clean(t) {
  const { v, id, name, cur, nu, people, expenses, u } = t;
  return { v, id, name, cur, nu: nu || 0, people: people || [], expenses: expenses || [], u: u || 0 };
}
function valid(t) {
  return t && t.v && typeof t.id === 'string' && Array.isArray(t.people) && Array.isArray(t.expenses);
}
// Same rule as the app: match items by id, the newer updatedAt (u) wins; deletes are tombstones
function merge(base, inc) {
  const out = clean(base);
  for (const k of ['people', 'expenses']) {
    for (const x of inc[k] || []) {
      if (!x || typeof x.id !== 'string') continue;
      const i = out[k].findIndex(y => y.id === x.id);
      if (i < 0) out[k].push(x);
      else if ((x.u || 0) > (out[k][i].u || 0)) out[k][i] = x;
    }
  }
  if ((inc.nu || 0) > out.nu) { out.name = inc.name; out.cur = inc.cur; out.nu = inc.nu; }
  out.u = Math.max(out.u, inc.u || 0);
  return out;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/ping') return json({ ok: true });

    // Receipt photos: one JPEG per expense, stored next to the trip
    const pm = url.pathname.match(/^\/api\/photo\/([^/]+)\/([^/]+)$/);
    if (pm) {
      const [, trip, item] = pm;
      if (!TRIP_ID.test(trip) || !ITEM_ID.test(item)) return json({ error: 'bad id' }, 400);
      const pkey = `photo:${trip}:${item}`;
      if (req.method === 'GET') {
        const img = await env.TRIPS.get(pkey, { type: 'arrayBuffer' });
        if (!img) return json({ error: 'not found' }, 404);
        return new Response(img, { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000' } });
      }
      if (req.method === 'PUT') {
        const buf = await req.arrayBuffer();
        if (buf.byteLength > MAX_PHOTO) return json({ error: 'too large' }, 413);
        const b = new Uint8Array(buf);
        if (b.length < 3 || b[0] !== 0xff || b[1] !== 0xd8) return json({ error: 'not a jpeg' }, 400);
        await env.TRIPS.put(pkey, buf, { expirationTtl: KEEP_FOR });
        return json({ ok: true });
      }
      if (req.method === 'DELETE') { await env.TRIPS.delete(pkey); return json({ ok: true }); }
      return json({ error: 'method not allowed' }, 405);
    }

    const m = url.pathname.match(/^\/api\/trip\/([^/]+)$/);
    if (!m) return env.ASSETS ? env.ASSETS.fetch(req) : json({ error: 'not found' }, 404);
    const id = m[1];
    if (!TRIP_ID.test(id)) return json({ error: 'bad id' }, 400);
    const key = 'trip:' + id;

    if (req.method === 'GET') {
      const t = await env.TRIPS.get(key);
      return t ? new Response(t, { headers: H }) : json({ error: 'not found' }, 404);
    }

    if (req.method === 'PUT') {
      const body = await req.text();
      if (body.length > MAX_BYTES) return json({ error: 'too large' }, 413);
      let inc;
      try { inc = JSON.parse(body); } catch { return json({ error: 'bad json' }, 400); }
      if (!valid(inc) || inc.id !== id) return json({ error: 'bad trip' }, 400);

      const current = await env.TRIPS.get(key);
      const merged = JSON.stringify(current ? merge(JSON.parse(current), inc) : clean(inc));
      if (merged !== current) await env.TRIPS.put(key, merged, { expirationTtl: KEEP_FOR });
      return new Response(merged, { headers: H });
    }

    return json({ error: 'method not allowed' }, 405);
  },
};
