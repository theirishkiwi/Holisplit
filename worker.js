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

// ---- Receipt scanning (Workers AI) ----
// The phone sends a photo; the model reads total, date, currency, shop and type of place.
// Nothing is stored. Only trips that exist on this server can scan, at most SCANS_PER_DAY per trip.
const SCAN_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const SCANS_PER_DAY = 100;
const MAX_SCAN_BYTES = 1.5 * 1024 * 1024;
const SCAN_PROMPT = `Read this receipt. Reply with only a JSON object, no other text:
{"total": number, "currency": "EUR" | "GBP" | "USD" | "CHF" | null, "date": "YYYY-MM-DD" | null, "merchant": string | null, "type": "supermarket" | "cafe" | "bar" | "restaurant" | "transport" | "hotel" | "activity" | "other"}
"total" is the final amount paid: the TOTALE / TOTAL / IMPORTO PAGATO / AMOUNT DUE line, not a subtotal, tax line or change.
Dates on European receipts are day/month/year. Use null for anything you cannot read.`;
const SCAN_TYPES = { supermarket: 'groceries', grocery: 'groceries', groceries: 'groceries', cafe: 'drinks', 'café': 'drinks', coffee: 'drinks', bar: 'drinks', pub: 'drinks',
  restaurant: 'food', pizzeria: 'food', takeaway: 'food', bakery: 'food', transport: 'transport', taxi: 'transport', fuel: 'transport',
  hotel: 'stay', accommodation: 'stay', activity: 'activity', museum: 'activity', other: 'other' };
const SCAN_CUR = { EUR: '€', GBP: '£', USD: '$', CHF: 'CHF', '€': '€', '£': '£', '$': '$' };

const scanNum = v => {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  let t = v.replace(/[^\d.,]/g, '').replace(/[.,]+$/, '');
  const i = Math.max(t.lastIndexOf('.'), t.lastIndexOf(','));
  t = i >= 0 && t.length - i - 1 <= 2 ? t.slice(0, i).replace(/[.,]/g, '') + '.' + t.slice(i + 1) : t.replace(/[.,]/g, '');
  return parseFloat(t);
};
function scanDate(v, today) {
  if (typeof v !== 'string') return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/), y, mo, d;
  if (m) [, y, mo, d] = m.map(Number);
  else if ((m = v.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/))) { d = +m[1]; mo = +m[2]; y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;          // not a real date
  const iso = dt.toISOString().slice(0, 10), t = new Date(today + 'T00:00:00Z');
  if (dt - t > 864e5 || t - dt > 2 * 365 * 864e5) return null;                 // future, or implausibly old
  return iso;
}
// Pull a validated result out of whatever the model said
export function parseScan(text, today) {
  const t = String(text || ''), m = t.match(/\{[\s\S]*\}/);
  let j = null;
  if (m) try { j = JSON.parse(m[0]); } catch { }
  if (!j) {
    // not valid JSON (e.g. "total": 65,90 or a reply cut short): pick the fields out one by one
    const f = k => { const x = t.match(new RegExp('"?' + k + '"?\\s*:\\s*("([^"]*)"|[\\d][\\d.,]*)', 'i')); return x ? (x[2] ?? x[1]) : null; };
    j = { total: f('total'), currency: f('currency'), date: f('date'), merchant: f('merchant'), type: f('type') };
  }
  const total = scanNum(j.total);
  const out = {
    total: total > 0 && total < 100000 ? Math.round(total * 100) / 100 : null,
    cur: SCAN_CUR[String(j.currency || '').trim().toUpperCase()] || SCAN_CUR[String(j.currency || '').trim()] || null,
    date: scanDate(j.date, today),
    merchant: typeof j.merchant === 'string' && j.merchant.trim() ? j.merchant.trim().replace(/\s+/g, ' ').slice(0, 40) : null,
    cat: SCAN_TYPES[String(j.type || '').toLowerCase().trim()] || 'other',
  };
  return out.total || out.date || out.merchant ? out : null;
}
// Ways of attaching the photo, in order: Cloudflare's own example first (system + user message, image as a data URL),
// then the OpenAI-style image_url message, then the older prompt + byte array form.
const SCAN_FORMATS = [
  (url) => ({ messages: [{ role: 'system', content: 'You read receipts and reply with JSON only.' }, { role: 'user', content: SCAN_PROMPT }], image: url }),
  (url) => ({ messages: [{ role: 'system', content: 'You read receipts and reply with JSON only.' }, { role: 'user', content: [{ type: 'text', text: SCAN_PROMPT }, { type: 'image_url', image_url: { url } }] }] }),
  (url, bytes) => ({ prompt: SCAN_PROMPT, image: [...bytes] }),
];
const isLicence = e => /agree|licen[cs]e/i.test(String(e && e.message));
async function runScanModel(env, bytes) {
  const url = dataUrl(bytes), errors = [];
  for (const make of SCAN_FORMATS) {
    const input = { ...make(url, bytes), max_tokens: 256, temperature: 0 };
    try { return await env.AI.run(SCAN_MODEL, input); }
    catch (e) {
      // Meta's licence must be accepted once per Cloudflare account; do it automatically and retry
      if (isLicence(e)) {
        await env.AI.run(SCAN_MODEL, { prompt: 'agree' });
        try { return await env.AI.run(SCAN_MODEL, input); } catch (e2) { e = e2; }
      }
      errors.push(String(e && e.message || e));
    }
  }
  throw new Error(errors.join(' | '));
}
function dataUrl(b) {
  let bin = ''; for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  return 'data:image/jpeg;base64,' + btoa(bin);
}
// The reply can come back as text, or already parsed into an object
export function scanText(r) {
  const v = r && typeof r === 'object' && 'response' in r ? r.response : r && typeof r === 'object' && 'result' in r ? r.result : r;
  if (v && typeof v === 'object') return v.response !== undefined ? scanText(v) : JSON.stringify(v);
  return String(v ?? '');
}
async function handleScan(req, env, trip) {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!env.AI) return json({ error: 'scanning not set up' }, 503);
  if (!TRIP_ID.test(trip)) return json({ error: 'bad id' }, 400);
  const rec = await env.TRIPS.get('trip:' + trip);
  if (goneFor(rec)) return goneFor(rec);
  if (!rec) return json({ error: 'trip not found' }, 404);
  const today = new Date().toISOString().slice(0, 10), ck = `scan:${trip}:${today}`;
  const used = parseInt(await env.TRIPS.get(ck) || '0', 10);
  if (used >= SCANS_PER_DAY) return json({ error: 'daily scan limit reached' }, 429);
  const buf = await req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > MAX_SCAN_BYTES) return json({ error: 'bad image size' }, 413);
  const b = new Uint8Array(buf);
  if (!(b[0] === 0xff && b[1] === 0xd8)) return json({ error: 'not a jpeg' }, 400);
  await env.TRIPS.put(ck, String(used + 1), { expirationTtl: 2 * 86400 });
  let r;
  try { r = await runScanModel(env, b); }
  catch (e) { console.log('scan: AI error', String(e && e.message)); return json({ error: 'ai unavailable', detail: String(e && e.message || e).slice(0, 400) }, 503); }
  const text = scanText(r), found = parseScan(text, today);
  if (!found) { console.log('scan: unreadable reply', text.slice(0, 300)); return json({ error: 'unreadable', detail: text.slice(0, 160) }, 422); }
  return json({ ok: true, ...found, usage: (r && r.usage) || null });
}

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
    if (url.pathname === '/api/ping') return json({ ok: true, scan: !!env.AI });
    const sm = url.pathname.match(/^\/api\/scan\/([^/]+)$/);
    if (sm) return handleScan(req, env, sm[1]);

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
