# Holiday Split

public/            the app (index.html), offline support (sw.js), icons and manifest
worker.js          sync API (/api/ping, /api/trip/<id>)
wrangler.jsonc     config: static assets + KV namespace "TRIPS"

## Tests
npm install
npm test      (50 tests: split maths, settling, couples, payments, currencies, amount entry, dates, worker sync, photos, link reset, encryption, delete and restore, closing screens, paid toggle, payment links)

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

## Paying
Each person can add Monzo, Revolut or Starling Settle Up names and UK bank details
(Settings -> Payment details). They are stored with the trip, so they are encrypted on encrypted trips.
Settle up shows Pay to whoever owes (opens their payment link; Monzo gets the amount on a £ trip)
and Remind to whoever is owed (WhatsApp message with how to pay). Coming back from a payment app
asks "Did you pay?" so the payment gets recorded. No bank linking, no fees from the app.
