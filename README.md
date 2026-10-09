# Holiday Split

public/            the app (index.html), offline support (sw.js), icons and manifest
worker.js          sync API (/api/ping, /api/trip/<id>)
wrangler.jsonc     config: static assets + KV namespace "TRIPS"

## Tests
npm install
npm test      (109 tests: split maths, settling, couples, joint accounts, payments, currencies, amount entry, dates, worker sync, photos, link reset, encryption, delete and restore, closing screens, paid toggle, payment links, permanent delete, layout, receipt scanning, duplicate checks, offline, settling in another currency, help and what's new, day-of-expense rates)

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
To remove one sooner, tap Delete next to it in Recently deleted and type DELETE. A trip deleted
for everyone is then erased from the server with its photos, and no phone can bring it back.

## Couples and joint accounts
Pair two people as a couple in Group (tap a person). Couples always settle up with the group as one, so there are fewer payments, and they're marked * on Settle up. To settle separately, unpair them; this syncs, so every phone shows the same payments. Each expense still shows each person's own share ("you owe €3.38").

If the couple shares money, e.g. a joint Monzo account, switch on **Joint account** in either partner's menu:
- Each expense counts the two of you together, whoever paid. If Leanne pays €200 for 8 people, Chris sees "you're owed €150.00" (the other six people's shares), not "you owe €25.00".
- There's never a payment between partners.
- It's saved on both people and syncs to everyone. Unpairing turns it off.

## Help and What's new
- **Help** (Settings → Help, or "How it works" on an empty trip) is a short guide built into the app, so it works offline.
- **What's new:** after an update, people who've used the app before see a one-line banner. **See** opens the list of changes. New users don't see it.
- **Adding to it:** add an entry at the top of `NEWS` in `public/index.html` with each change worth telling the group about. The date of the newest entry is also the "Updated" date in Settings.

## Expenses in another currency
Tap the currency next to the amount (marked ⌄) and pick e.g. € on a £ trip.
- **Day's rate filled in:** the rate for the expense's date is filled in from Frankfurter via `/api/rate/EUR/GBP?date=YYYY-MM-DD`. Changing the date updates it. Past rates never change, so the server keeps each one permanently.
- **Your own rate:** typing a rate keeps it. "Use the rate for …" switches back to the day's rate.
- **Receipts:** a scanned receipt in another currency gets the rate for the receipt's date.
- **No signal:** the last rate you used is filled in, with a note to check it.

## Settling up in another currency
Expenses stay in the trip currency, but Settle up can show and pay in another. For example, a € trip can be settled in £ so Monzo links fill in the amount. Tap **Settle in €** on Settle up and pick a currency.
- **Live rate:** filled in from [Frankfurter](https://frankfurter.dev/) (free, no key, central-bank rates) via `/api/rate/EUR/GBP`. The server keeps each day's rate, so it's fetched once a day at most, and it falls back to the last known rate if Frankfurter is down.
- **Updating:** a live rate updates daily until the first payment is recorded, then stays fixed so everyone pays at the same rate.
- **Your own rate:** type a rate to use, e.g. the one your bank gave you. It's never replaced.
- **Recording payments:** a payment is recorded with what was sent (e.g. £25.84) and the exact trip amount (€30.00), so balances clear to the cent.
- **Sharing:** the currency and rate are saved on the trip and sync to everyone.

## Paying
Each person can add Monzo, Revolut or Starling Settle Up names and UK bank details
(Settings -> Payment details). They are stored with the trip, so they are encrypted on encrypted trips.
Settle up shows Pay to whoever owes (opens their payment link; Monzo gets the amount on a £ trip)
and Remind to whoever is owed (WhatsApp message with how to pay). Coming back from a payment app
asks "Did you pay?" so the payment gets recorded. No bank linking, no fees from the app.

## Receipt scanning
Adding a photo to an expense sends it to the Worker's /api/scan, which asks Workers AI
(Llama 3.2 11B Vision) for the total, currency, date, shop name and type of place, and fills
the form without overwriting anything already typed. The photo is not stored by the scan.
Settings -> "Read receipt photos" turns it off. Needs the "ai" binding in wrangler.jsonc.

Cost: Workers AI includes 10,000 neurons a day free (resets 00:00 UTC). Llama 3.2 Vision costs
4,410 neurons per million input tokens and 61,493 per million output tokens. A scan sends an
image of at most 1120 px (up to 4 image tiles, roughly 1,600-6,400 tokens) plus a short prompt,
and the reply is capped at 160 tokens (usually ~50), so a scan uses about 10-40 neurons:
roughly 250-1,000 scans a day within the free allowance. Each trip is also capped at 100
scans a day. The Worker returns the model's token usage with each scan, and Cloudflare's
dashboard (AI > Workers AI) shows the exact neurons used.

## Duplicate checks
A duplicate always needs the **same amount** (to the cent, or the same foreign amount), plus one of:
- the same shop name within 2 days ("Eurospin" and "EUROSPIN Italia"), or
- the same day, where only one has a shop name and the type matches ("Groceries" and "Eurospin").

These are never flagged: different amounts, two different shop names, different types (a €12 ferry and a €12 gelato), or anything more than 2 days apart. "Dinner" or "Groceries" don't count as shop names. You can choose "Don't add" or "Add anyway". Editing an expense is checked only when its amount, date or description changes. A scanned receipt is checked as soon as it's read. Duplicates already in the trip appear in a "possible duplicates · Review" notice on Expenses: delete one (with Undo) or mark the pair "Not duplicates". That choice syncs, so nobody is asked again.
