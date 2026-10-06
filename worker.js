// Holiday Split sync API. Static files in ./public are served automatically;
// this Worker only handles /api/*. Each trip is one JSON value in KV, keyed by its random id.
const TRIP_ID = /^[a-z0-9]{12,40}$/;
const ITEM_ID = /^[A-Za-z0-9_-]{2,40}$/;
const MAX_BYTES = 512 * 1024;
const MAX_PHOTO = 3 * 1024 * 1024;
const KEEP_FOR = 60 * 60 * 24 * 365; // a trip is removed a year after its last change
const KEEP_DELETED = 60 * 60 * 24 * 30; // a deleted trip can be restored for 30 days, then it expires
const H = { 'content-type': 'application/json', 'cache-control': 'no-store' };
// A reset link leaves this marker at the old ID: the old link stops working and reveals nothing
const REVOKED = '{"revoked":true}';
// A permanently deleted trip leaves this marker so no phone's old copy can bring it back
const ERASED = '{"erased":true}';
const goneFor = v => v === REVOKED ? json({ error: 'link reset' }, 410) : v === ERASED ? json({ error: 'erased' }, 410) : null;
const gone = () => json({ error: 'link reset' }, 410);
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: H });

// Encrypted trips (v2) are an opaque envelope { v: 2, id, rev, enc, prev? }. The server never sees the key,
// so it cannot merge them: phones merge, and rev makes a stale write fail with 409 so the phone merges and retries.
const isEnc = t => !!t && t.v === 2 && typeof t.enc === 'string';
const parse = s => { try { return JSON.parse(s); } catch { return null; } };

// Keep only the fields the app uses
function clean(t) {
  const { v, id, name, cur, nu, people, expenses, u, prev, del, delBy, du } = t;
  const out = { v, id, name, cur, nu: nu || 0, people: people || [], expenses: expenses || [], u: u || 0 };
  if (typeof prev === 'string') out.prev = prev;
  if (du) { out.del = del || null; out.delBy = delBy || null; out.du = du; }
  return out;
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
  if ((inc.du || 0) > (out.du || 0)) { out.del = inc.del || null; out.delBy = inc.delBy || null; out.du = inc.du; }
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
        const b = new Uint8Array(img);
        const type = b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg' : 'application/octet-stream';
        return new Response(img, { headers: { 'content-type': type, 'cache-control': 'private, max-age=31536000' } });
      }
      if (req.method === 'PUT') {
        const rec = await env.TRIPS.get('trip:' + trip);
        if (goneFor(rec)) return goneFor(rec);
        const buf = await req.arrayBuffer();
        if (buf.byteLength > MAX_PHOTO) return json({ error: 'too large' }, 413);
        const b = new Uint8Array(buf);
        const jpeg = b.length >= 3 && b[0] === 0xff && b[1] === 0xd8;
        if (!jpeg && !isEnc(parse(rec))) return json({ error: 'not a jpeg' }, 400);
        await env.TRIPS.put(pkey, buf, { expirationTtl: KEEP_FOR });
        return json({ ok: true });
      }
      if (req.method === 'DELETE') { await env.TRIPS.delete(pkey); return json({ ok: true }); }
      return json({ error: 'method not allowed' }, 405);
    }

    // Reset invite link: the phone first creates the trip at a new ID (with prev = old ID), then calls this.
    // Any last edits at the old ID are merged in, photos move across, and the old ID is turned off.
    const mv = url.pathname.match(/^\/api\/trip\/([^/]+)\/move$/);
    if (mv) {
      if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      const from = mv[1];
      let to;
      try { ({ to } = await req.json()); } catch { return json({ error: 'bad json' }, 400); }
      if (!TRIP_ID.test(from) || !TRIP_ID.test(to) || from === to) return json({ error: 'bad id' }, 400);
      const [oldT, newT] = await Promise.all([env.TRIPS.get('trip:' + from), env.TRIPS.get('trip:' + to)]);
      if (goneFor(oldT)) return goneFor(oldT);
      if (!newT) return json({ error: 'new trip not found' }, 404);
      const next = JSON.parse(newT);
      if (next.prev !== from) return json({ error: 'new trip does not continue this one' }, 400);
      const prevT = oldT ? JSON.parse(oldT) : null;
      if (isEnc(prevT) && !isEnc(next)) return json({ error: 'cannot remove encryption' }, 400);
      let merged = next;
      // plain trips are merged here; an encrypted new trip was already merged by the phone before it was sent
      if (prevT && !isEnc(next)) { merged = merge(next, prevT); merged.id = to; merged.prev = from; }
      const out = JSON.stringify(merged);
      await env.TRIPS.put('trip:' + to, out, { expirationTtl: KEEP_FOR });
      const prefix = `photo:${from}:`;
      let cursor;
      do {
        const page = await env.TRIPS.list({ prefix, cursor });
        for (const k of page.keys) {
          const img = await env.TRIPS.get(k.name, { type: 'arrayBuffer' });
          if (img) await env.TRIPS.put(`photo:${to}:` + k.name.slice(prefix.length), img, { expirationTtl: KEEP_FOR });
          await env.TRIPS.delete(k.name);
        }
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor);
      await env.TRIPS.put('trip:' + from, REVOKED, { expirationTtl: KEEP_FOR });
      return new Response(out, { headers: H });
    }

    const m = url.pathname.match(/^\/api\/trip\/([^/]+)$/);
    if (!m) return env.ASSETS ? env.ASSETS.fetch(req) : json({ error: 'not found' }, 404);
    const id = m[1];
    if (!TRIP_ID.test(id)) return json({ error: 'bad id' }, 400);
    const key = 'trip:' + id;

    if (req.method === 'GET') {
      const t = await env.TRIPS.get(key);
      if (goneFor(t)) return goneFor(t);
      return t ? new Response(t, { headers: H }) : json({ error: 'not found' }, 404);
    }

    if (req.method === 'PUT') {
      const body = await req.text();
      if (body.length > MAX_BYTES) return json({ error: 'too large' }, 413);
      let inc;
      try { inc = JSON.parse(body); } catch { return json({ error: 'bad json' }, 400); }
      const current = await env.TRIPS.get(key);
      if (goneFor(current)) return goneFor(current);

      if (isEnc(inc)) {
        if (inc.id !== id) return json({ error: 'bad trip' }, 400);
        const cur = current ? JSON.parse(current) : null;
        if (cur && !isEnc(cur)) return json({ error: 'trip is not encrypted' }, 400);
        if ((cur?.rev || 0) !== (inc.rev || 0)) return json({ error: 'conflict', current: cur }, 409);
        const out = { v: 2, id, rev: (cur?.rev || 0) + 1, enc: inc.enc };
        const prev = cur?.prev ?? inc.prev;
        if (typeof prev === 'string') out.prev = prev;
        if (inc.del) out.del = inc.del; // the only thing the server learns: this trip is deleted, so keep it 30 days
        const str = JSON.stringify(out);
        await env.TRIPS.put(key, str, { expirationTtl: inc.del ? KEEP_DELETED : KEEP_FOR });
        return new Response(str, { headers: H });
      }

      if (!valid(inc) || inc.id !== id) return json({ error: 'bad trip' }, 400);
      if (isEnc(parse(current))) return json({ error: 'trip is encrypted' }, 400);
      const m = current ? merge(JSON.parse(current), inc) : clean(inc);
      const merged = JSON.stringify(m);
      if (merged !== current) await env.TRIPS.put(key, merged, { expirationTtl: m.del ? KEEP_DELETED : KEEP_FOR });
      return new Response(merged, { headers: H });
    }

    if (req.method === 'DELETE') {
      const current = await env.TRIPS.get(key);
      if (goneFor(current)) return goneFor(current);
      if (!current) return json({ error: 'not found' }, 404);
      const t = parse(current);
      if (!t || !t.del) return json({ error: 'delete it for everyone first' }, 409);
      const prefix = `photo:${id}:`;
      let cursor;
      do {
        const page = await env.TRIPS.list({ prefix, cursor });
        for (const k of page.keys) await env.TRIPS.delete(k.name);
        cursor = page.list_complete ? null : page.cursor;
      } while (cursor);
      await env.TRIPS.put(key, ERASED, { expirationTtl: KEEP_DELETED });
      return json({ ok: true });
    }

    return json({ error: 'method not allowed' }, 405);
  },
};
