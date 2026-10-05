# Holiday Split

public/            the app (index.html), offline support (sw.js), icons and manifest
worker.js          sync API (/api/ping, /api/trip/<id>)
wrangler.jsonc     config: static assets + KV namespace "TRIPS"

## Tests
npm install
npm test      (39 tests: split maths, settling, couples, payments, currencies, amount entry, dates, worker sync, photos, link reset, encryption, delete and restore, closing screens, paid toggle)

## Deploy (one time)
1. npx wrangler login
2. npx wrangler kv namespace create TRIPS
   Paste the printed id into wrangler.jsonc
3. Set "name" in wrangler.jsonc to your existing Worker's name
4. npx wrangler deploy

## Privacy
New trips are end-to-end encrypted (AES-GCM). The key is the part of the invite link after the dot
(#tripid.key); it never reaches the server, so the Worker and the Cloudflare dashboard only see ciphertext.
Older plain trips keep working; Settings -> Encrypt moves one to a new encrypted link.
If every copy of a link is lost, the trip cannot be recovered.

## Deleting trips
Settings -> Delete this trip asks first. "Remove from this phone" leaves the group's copy alone;
"Delete for everyone" (two taps) removes it from every phone. Either can be restored from
Settings -> Recently deleted (or the banner on the trip) for 30 days. After that the phone clears it
and the server copy expires.
