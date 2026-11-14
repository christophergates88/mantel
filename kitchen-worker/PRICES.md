# Simmer: the weekly Walmart price check

Simmer's Walmart prices live in `kitchen/data.js` (`CATALOG`, third column). `WM` in the same file names the walmart.com
item each price comes from. This note is the whole procedure for re-reading them. It is written so a scheduled Claude
session can follow it with nobody watching.

Hard limits for whoever runs this: read prices only. Never sign in to Walmart, never add anything to a cart, never buy
anything, never solve a "robot or human" check. If walmart.com shows that check, or the browser on the Mac cannot be
reached, stop and report; do not look for another way in. Change nothing in the repository except what
`kitchen-worker/tools/set-prices.mjs` writes.

## Steps

1. Get the repository `christophergates88/mantel` with push access and clone it. Work on `main`.
2. In the built-in browser on the Mac, open `https://www.walmart.com/store/5482-eatonton-ga`. If the page offers
   "Make this my store", click it (this only sets which store's prices the site shows; it is not an account setting).
3. In that tab, run the reader below with the page-script tool. It fetches each item's page from walmart.com itself,
   one at a time with a pause, and keeps the results in `window.__read`. It takes about fifteen minutes, so start it and
   then poll `window.__readDone` every minute or so rather than waiting on one call.

   ```js
   window.__read = {}; window.__readDone = false;
   const ids = /* the item ids: every value in WM (for an array value, its first element) */;
   (async () => {
     for (const id of ids) {
       try {
         const res = await fetch('/ip/' + id, { credentials: 'include' }); const html = await res.text();
         const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
         if (!m) { const robot = /Robot or human/i.test(html); window.__read[id] = { error: robot ? 'robot check' : 'no data' }; if (robot) break; continue; }
         const p = JSON.parse(m[1]).props.pageProps.initialData?.data?.product;
         window.__read[id] = p ? { price: p.priceInfo?.currentPrice?.price, unit: p.priceInfo?.unitPrice?.priceString || '', stock: p.availabilityStatus, store: (m[1].match(/"storeId":"?(\d+)/) || [])[1] } : { error: 'no product' };
       } catch (e) { window.__read[id] = { error: String(e).slice(0, 80) }; }
       await new Promise(r => setTimeout(r, 700));
     }
     window.__readDone = true;
   })();
   ```

   Get the ids with: `node --input-type=module -e "const {WM}=await import('./kitchen/data.js'); console.log(JSON.stringify(Object.values(WM).map(s=>Array.isArray(s)?s[0]:s)))"`
4. When it is done, read `JSON.stringify(window.__read)` back and save it as `read.json` in the working directory (not in the repo).
5. Dry run: `node kitchen-worker/tools/set-prices.mjs read.json`. Read what it says. It refuses on its own to apply a
   price that jumped more than 40% down or 60% up, a price read for another store, or a run where fewer than 80% of
   the prices were read.
6. If the dry run looks sane, apply it: `node kitchen-worker/tools/set-prices.mjs read.json --write`. This updates the
   Walmart prices, moves each Ingles estimate by the same proportion, sets `PRICED` and `PRICED_ON`, and stamps
   `kitchen/version.txt` so phones pick it up.
7. `git diff --stat` must show only `kitchen/data.js` and `kitchen/version.txt`. Commit ("Simmer: weekly Walmart price
   check, <date>") and push to `main`. If nothing changed, do not commit.
8. Report in a few lines: how many prices were read, which changed and by how much, and anything skipped.
