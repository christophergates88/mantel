# Simmer photo reader

The small private server behind the photo buttons in `/kitchen` (Simmer). It takes a photo of the fridge, pantry
or a receipt, asks a vision model what food is in it, and sends back a list. Photos are not stored.

It runs as the Worker `simmer-reader` (deployed by upload on 2026-11-14; redeploy the same way or connect the repo):

1. In the Cloudflare dashboard: Workers & Pages, Create, Import a repository, pick `christophergates88/mantel`,
   and set the root directory to `kitchen-worker`. Deploy.
2. Copy the address it gives (it ends in `.workers.dev`) into `kitchen/config.js` as `READER_URL`.
3. Optional, for better reading: add a secret named `ANTHROPIC_API_KEY`. Without it the reader uses
   Cloudflare's own vision model, which needs no key.

Limits: only the Simmer page can call it, and it stops at 40 reads a day (`MAX_READS_PER_DAY`).

## New recipe ideas

`POST /ideas` writes three new recipes to the house rules. It is off until the Worker has a secret named
`ANTHROPIC_API_KEY`; the app hides its "Give me new ideas" button until `/health` reports `"writer": "claude"`.
With the key set, receipt and pantry photos are read by Claude too.

## Deploying

The Worker was created in the dashboard and is updated by uploading `src/index.js` with these bindings:
`AI` (Workers AI), `SIMMER_KV` (KV namespace `simmer-kitchen`), and the plain-text vars in `wrangler.jsonc`.
Upload with `keep_bindings: ["secret_text"]` so the secret is not removed.

## Updating the app

After changing anything in `/kitchen`, write a new value into `kitchen/version.txt` (for example `date +%s > kitchen/version.txt`).
`boot.js` reads it and loads that version of every file, so phones get the update on the next open.

## Alerts and dish photos

- `GET /push/key`, `POST /push/sub|unsub|test/<code>`, `GET /push/now/<code>`: Web Push with no message body. The Worker makes and keeps its own signing key in KV (`vapid`). The phones work out the alerts (morning plan, start the pot, dinner is ready, thaw tonight) and keep them in the shared kitchen document as `nudges`, each with the moment it is due. A cron trigger (`*/15 * * * *`) runs `tick()`, which sends every nudge that has come due in the last two hours, once. The message is stored under `now:<code>`; the phone's `sw.js` fetches it from `/push/now` and shows it. A kitchen document with no `nudges` (a phone that has not opened the newer app) still gets the plain morning message.
- `POST /push/test/<code>` answers with each phone's push service, status and reason, so the app can say why a test failed.

## The family's own recipes

`POST /recipe` takes a photo of a recipe card or page, or pasted text, and returns it in the app's recipe format without changing how it is cooked. It shares the daily allowance with `/ideas`. A dinner that is not made in a slow cooker is turned down with a reason. Added sugar is kept but flagged in `note`.

## Prices

See `PRICES.md` for the weekly Walmart price check and `tools/set-prices.mjs`.
- `GET|PUT|DELETE /photo/<code>/<recipe id>`: the family's own JPEG for a dish, kept in KV.
