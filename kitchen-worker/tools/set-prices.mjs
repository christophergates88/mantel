// Applies freshly read Walmart prices to kitchen/data.js. Used by the weekly price check (see kitchen-worker/PRICES.md).
//
//   node kitchen-worker/tools/set-prices.mjs read.json            (dry run: prints what would change)
//   node kitchen-worker/tools/set-prices.mjs read.json --write    (changes data.js and version.txt)
//
// read.json is what the page reader returned: { "<walmart item id>": { "price": 0.92, "unit": "$9.47/lb", "store": "5482", "stock": "IN_STOCK" }, ... }
// Rules: only the Eatonton store (5482) counts; a price that moved more than 40% down or 60% up is left alone and
// reported, because it is more likely a different package than a real change; each Ingles estimate keeps its
// existing gap over Walmart. Nothing but the two price columns, PRICED and PRICED_ON is touched.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const file = path.join(root, 'kitchen/data.js');
const read = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const write = process.argv.includes('--write');
const { CATALOG, WM } = await import(file + '?' + Date.now());
let src = fs.readFileSync(file, 'utf8');
const cents = n => Math.round(n * 100) / 100;
const changed = [], skipped = [];

for (const [id, spec] of Object.entries(WM)) {
  const [item, mode, n] = Array.isArray(spec) ? spec : [spec];
  const got = read[item], old = CATALOG[id];
  if (!old) { skipped.push(`${id}: not in the catalog`); continue; }
  if (!got || !(got.price > 0)) { skipped.push(`${id}: no price read`); continue; }
  if (String(got.store) !== '5482') { skipped.push(`${id}: read for store ${got.store}, not Eatonton`); continue; }
  let price = got.price;
  if (mode === 'lb') { const m = /\$([\d.]+)\s*\/\s*lb/.exec(got.unit || ''); if (!m) { skipped.push(`${id}: no per-pound price`); continue; } price = Number(m[1]) * n; }
  if (mode === 'each') price = got.price * n;
  price = cents(price);
  if (price === old[2]) continue;
  if (price < old[2] * 0.6 || price > old[2] * 1.6) { skipped.push(`${id}: ${old[2]} -> ${price} is too big a jump, left alone`); continue; }
  const ingles = cents(price * (old[3] / old[2]));
  const line = new RegExp(`^(\\s*${id}:\\s*\\['(?:[^'\\\\]|\\\\.)*', '[^']*', )([\\d.]+), ([\\d.]+),`, 'm');
  const at = line.exec(src);
  if (!at || Number(at[2]) !== old[2] || Number(at[3]) !== old[3]) { skipped.push(`${id}: could not find its line`); continue; }
  src = src.replace(line, `$1${price.toFixed(2)}, ${ingles.toFixed(2)},`);
  changed.push(`${id}: Walmart ${old[2]} -> ${price}, Ingles estimate ${old[3]} -> ${ingles}`);
}

const today = new Date(), stamp = today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(today);
const readCount = Object.values(WM).filter(s => read[Array.isArray(s) ? s[0] : s]?.price > 0).length;
console.log(`${readCount} of ${Object.keys(WM).length} prices read. ${changed.length} changed, ${skipped.length} skipped.`);
for (const c of changed) console.log('  changed  ' + c);
for (const s of skipped) console.log('  skipped  ' + s);
if (readCount < Object.keys(WM).length * 0.8) { console.log('Too few prices were read to trust this run. Nothing written.'); process.exit(2); }
if (!write) { console.log('Dry run. Add --write to apply.'); process.exit(0); }
src = src.replace(/export const PRICED = '[^']*';/, `export const PRICED = '${stamp}';`).replace(/export const PRICED_ON = '[^']*';/, `export const PRICED_ON = '${iso}';`);
fs.writeFileSync(file, src);
await import(file + '?check' + Date.now()); // fails loudly if the file no longer loads
fs.writeFileSync(path.join(root, 'kitchen/version.txt'), String(Math.floor(Date.now() / 1000)) + '\n');
console.log(`Written. Prices are now dated ${stamp}.`);
