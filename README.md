# Holiday Split

public/            the app (index.html), offline support (sw.js), icons and manifest
worker.js          sync API (/api/ping, /api/trip/<id>)
wrangler.jsonc     config: static assets + KV namespace "TRIPS"

## Tests
npm install
npm test      (18 tests: split maths, settling, couples, payments, currencies, amount entry, dates, worker sync and photos)

## Deploy (one time)
1. npx wrangler login
2. npx wrangler kv namespace create TRIPS
   Paste the printed id into wrangler.jsonc
3. Set "name" in wrangler.jsonc to your existing Worker's name
4. npx wrangler deploy
