# Holiday Split

public/index.html  the app
worker.js          sync API (/api/ping, /api/trip/<id>)
wrangler.toml      config: static assets + KV namespace "TRIPS"

## Deploy (one time)
1. npx wrangler login
2. npx wrangler kv namespace create TRIPS
   Paste the printed id into wrangler.toml
3. Set "name" in wrangler.toml to your existing Worker's name
4. npx wrangler deploy
