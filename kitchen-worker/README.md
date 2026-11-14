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

## Morning reminder and dish photos

- `GET /push/key`, `POST /push/sub|unsub|test/<code>`: Web Push with no message body. The Worker makes and keeps its own signing key in KV (`vapid`). A cron trigger (`*/15 * * * *`) runs `morning()`, which nudges each household once a day at its chosen Eastern time; the phone's `sw.js` then reads that day's line from the shared kitchen document.
- `GET|PUT|DELETE /photo/<code>/<recipe id>`: the family's own JPEG for a dish, kept in KV.
