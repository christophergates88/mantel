// Simmer photo reader: a Cloudflare Worker.
//
// POST /read  { kind: "pantry" | "receipt", images: [base64 JPEG, up to 4], catalog: [{ id, name }] }
//   → { items: [{ id | null, name, price | null }], store: "w" | "i" | null }
// POST /ideas { kind, catalog, have, avoid, loved, looks } → { recipes: [...] } three new recipes written to the house rules
// GET|PUT /house/<code> → the household's shared kitchen document
// GET /health → { ok, reader }
//
// Photos are passed straight to the model and never stored. With the secret ANTHROPIC_API_KEY set it uses Claude;
// without it, it uses the Workers AI vision model (the "AI" binding), which needs no key.
// Guards: only the Simmer page may call it (ALLOWED_ORIGINS), a size limit, and a daily cap (MAX_READS_PER_DAY,
// counted in KV when a SIMMER_KV binding exists, otherwise per running instance).

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const PROMPT = (kind, catalog) => `You help a family keep track of the food in their kitchen.
${kind === 'receipt'
  ? 'The photos show a grocery store receipt. List every FOOD item bought, with the price paid for that line as a number. Skip non-food items, tax, totals, coupons and bag fees. Also say which store it is: "w" for Walmart, "i" for Ingles, or null for any other store or if you cannot tell.'
  : 'The photos show the inside of a fridge, freezer or pantry. List every distinct food item you can actually see. Do not guess at things hidden behind others or inside closed containers. Price is always null. Store is always null.'}

The family's app knows these ingredients:
${catalog.map(c => `${c.id} = ${c.name}`).join('\n')}

For each item: if it is one of those ingredients (same food, any brand or size; fresh, frozen or canned must match), give that id. Otherwise id is null. Give a short plain name either way (for example "Eggs", "Whole milk", "Cheddar cheese"). List each food once.
Reply with ONLY this JSON, no other words: {"store": "w" | "i" | null, "items": [{"id": "..." | null, "name": "...", "price": number | null}]}`;

let localCount = { day: '', n: 0 };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0] || 'null',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Vary': 'Origin',
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors },
    });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, reader: env.ANTHROPIC_API_KEY ? 'claude' : env.AI ? 'workers-ai' : 'none', writer: env.ANTHROPIC_API_KEY ? 'claude' : 'none' });
    }
    // Shared kitchen: one small JSON document per household code, so two phones see the same plan and pantry.
    const house = url.pathname.match(/^\/house\/([a-z0-9]{16,32})$/);
    if (house) {
      if (!allowed.includes(origin)) return json({ error: 'This only answers the Simmer page.' }, 403);
      if (!env.SIMMER_KV) return json({ error: 'sharing is not set up' }, 503);
      const key = `house:${house[1]}`;
      if (request.method === 'GET') {
        const doc = await env.SIMMER_KV.get(key);
        return new Response(doc || 'null', { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors } });
      }
      if (request.method === 'PUT') {
        const text = await request.text();
        if (text.length > 300000) return json({ error: 'too large' }, 413);
        let doc;
        try { doc = JSON.parse(text); } catch { return json({ error: 'bad request' }, 400); }
        if (!doc || typeof doc !== 'object' || typeof doc.updatedAt !== 'number') return json({ error: 'bad request' }, 400);
        const cur = JSON.parse((await env.SIMMER_KV.get(key)) || 'null');
        if (cur && cur.updatedAt > doc.updatedAt) return json({ ok: false, newer: cur });
        await env.SIMMER_KV.put(key, text);
        return json({ ok: true });
      }
      return json({ error: 'not found' }, 404);
    }

    if (request.method === 'POST' && url.pathname === '/ideas') {
      if (!allowed.includes(origin)) return json({ error: 'This only answers the Simmer page.' }, 403);
      if (!env.ANTHROPIC_API_KEY) return json({ error: 'New ideas are not switched on yet.' }, 503);
      return ideas(request, env, json);
    }

    if (request.method !== 'POST' || url.pathname !== '/read') return json({ error: 'not found' }, 404);
    if (!allowed.includes(origin)) return json({ error: 'This reader only answers the Simmer page.' }, 403);

    const maxBytes = 6 * 1024 * 1024;
    if (Number(request.headers.get('content-length') || 0) > maxBytes) return json({ error: 'Those photos are too large. Try fewer at once.' }, 413);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
    const kind = body.kind === 'receipt' ? 'receipt' : 'pantry';
    const images = Array.isArray(body.images) ? body.images.filter(s => typeof s === 'string' && /^[A-Za-z0-9+/=]+$/.test(s)).slice(0, 4) : [];
    const catalog = Array.isArray(body.catalog)
      ? body.catalog.slice(0, 120).map(c => ({ id: String(c.id || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 30), name: String(c.name || '').replace(/[\r\n]/g, ' ').slice(0, 60) })).filter(c => c.id && c.name)
      : [];
    if (!images.length) return json({ error: 'No photo arrived. Try again.' }, 400);

    // Daily cap, so a stranger or a bug can't run up a bill.
    const cap = parseInt(env.MAX_READS_PER_DAY || '40', 10);
    const day = new Date().toISOString().slice(0, 10);
    let used;
    if (env.SIMMER_KV) {
      used = parseInt((await env.SIMMER_KV.get(`reads:${day}`)) || '0', 10);
      if (used < cap) await env.SIMMER_KV.put(`reads:${day}`, String(used + 1), { expirationTtl: 172800 });
    } else {
      if (localCount.day !== day) localCount = { day, n: 0 };
      used = localCount.n++;
    }
    if (used >= cap) return json({ error: "Today's photo limit is used up. It resets tomorrow." }, 429);

    let text;
    try {
      text = await ask(env, PROMPT(kind, catalog), images);
    } catch (e) {
      return json({ error: 'The photo reader is having trouble. Try again in a minute.', detail: String(e.message || e).slice(0, 200) }, 502);
    }

    const parsed = extractJSON(text);
    if (!parsed || !Array.isArray(parsed.items)) return json({ error: 'The photo could not be read clearly. Try again with more light.' }, 502);
    const known = new Set(catalog.map(c => c.id));
    const seen = new Set();
    const items = [];
    for (const it of parsed.items.slice(0, 80)) {
      const id = known.has(it.id) ? it.id : null;
      const name = String(it.name || '').trim().slice(0, 40);
      const key = id || name.toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const price = Number(it.price);
      items.push({ id, name, price: kind === 'receipt' && price > 0 && price < 200 ? Math.round(price * 100) / 100 : null });
    }
    const store = kind === 'receipt' && (parsed.store === 'w' || parsed.store === 'i') ? parsed.store : null;
    return json({ items, store });
  },
};

// One question to the model, with optional photos. Claude when a key is set, otherwise Workers AI.
async function ask(env, prompt, images = [], maxTokens = 3000) {
  if (env.ANTHROPIC_API_KEY) {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env.MODEL || 'claude-haiku-5-5',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: [
          ...images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
          { type: 'text', text: prompt },
        ] }],
      }),
    });
    if (!res.ok) throw new Error(`model service ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const data = await res.json();
    return (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  }
  if (!env.AI) throw new Error('no model configured');
  const out = await env.AI.run(env.CF_VISION_MODEL || '@cf/mistralai/mistral-small-3.1-24b-instruct', {
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: images.length ? [
      { type: 'text', text: prompt },
      ...images.map(data => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${data}` } })),
    ] : prompt }],
  });
  const text = out?.response ?? out?.choices?.[0]?.message?.content ?? '';
  return typeof text === 'string' ? text : JSON.stringify(text);
}

// Recipe writing is only switched on with a Claude key. The free Workers AI models were tried on 2026-11-14 and wrote
// recipes that were not good enough to cook from (wrong methods, and one unsafe way of cooking chicken for a toddler).
async function write(env, prompt, maxTokens) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('no writer configured');
  const model = env.IDEAS_MODEL || env.MODEL || 'claude-haiku-5-5';
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`model service ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const data = await res.json();
  return { text: (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n'), model };
}

// ---------------------------------------------------------------- new recipe ideas

const SECTIONS = ['Meat', 'Produce', 'Cans and jars', 'Dairy and frozen', 'Grains'];
const str = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt; };

const RULES = `House rules, all of them required:
- Healthy, built on whole foods. NO added sugar of any kind: no sugar, honey, maple syrup, agave, and nothing that usually contains it (barbecue sauce, ketchup, teriyaki, sweetened yogurt, seasoning packets, canned soup).
- Low prep: 10 minutes of hands-on work at most. No browning or pre-cooking, except ground meat may be browned for 5 minutes.
- Few ingredients: 4 to 8 in total, counting spices. Ordinary things an American supermarket (Walmart) sells. Prefer what the family already has.
- A 17-month-old eats this too: mild, no whole nuts, no honey, nothing hard or round that is a choking risk, easy on the salt.
- Plain American home cooking that tastes good: season it properly (garlic, herbs, citrus, spices). Short, plain names in sentence case (no brand names, no "healthy" or "easy" in the name).
- The three recipes must differ from each other in their main ingredient, and none may be a variation of a recipe the family already has.
- Use an id from the ingredient list whenever the food matches, even loosely (frozen green beans = greenBeans). Only invent a new ingredient when nothing on the list fits.`;

function ideaPrompt(kind, catalog, have, avoid, loved, looks) {
  const dinner = kind === 'dinner';
  return `Write 3 new ${dinner ? 'slow cooker dinner' : kind === 'breakfast' ? 'make-ahead toddler breakfast' : 'make-ahead toddler snack'} recipes for a family.

${RULES}
${dinner
  ? `- Slow cooker on LOW, 5 to 9 hours. At least 28 grams of protein a serving. Thick, never soupy or watery.
- Food-safe and sensible: whole cuts of meat go in raw and thawed; ground meat is browned in a pan first; canned beans only (never dry kidney beans); dairy and spinach are stirred in at the end; NEVER cook rice or pasta in the pot, list it as an ingredient with the amount "to serve".`
  : `- Made in one batch on the weekend in the oven, on the stovetop, in the slow cooker or with no cooking, then kept in the fridge or freezer for the week. Soft enough for a toddler.
- Food-safe and sensible: eggs fully cooked. Meat is rare in these; if used it must be ground turkey mixed and shaped into meatballs or patties and baked at 400°F until 165°F inside. Never raw diced chicken in a batter, muffin or bite. Pancakes are cooked on the stovetop, muffins and bars in the oven. Give the oven temperature and time in "method".`}

Ingredients the app already knows (id = name). Use these ids whenever the food matches:
${catalog.map(c => `${c.id} = ${c.name}`).join('\n')}

In the kitchen right now: ${have.join(', ') || 'only spices'}.
${loved.length ? `The family loved: ${loved.join('; ')}. Lean toward that kind of food.` : ''}
They already have these recipes, so write something clearly different: ${avoid.join('; ')}.

For each recipe pick "look": the id of the existing dish it would most resemble on a plate, from: ${looks.map(l => `${l.id} (${l.name})`).join(', ')}.

Reply with ONLY this JSON, no other words:
{"recipes":[{"name":"","blurb":"one or two short sentences on why it is good",${dinner ? '"hours":6,"serves":6,"protein":30' : '"method":"Oven, 350°F, 20 minutes","makes":"12 muffins","keeps":"Fridge 4 days. Freezer 2 months."'},"ings":[{"id":"catalog id or null","name":"plain ingredient name","amount":"how much goes in, e.g. 2 lb or 1 can, drained","packs":1,"section":"Meat | Produce | Cans and jars | Dairy and frozen | Grains","buy":"the package you buy, e.g. 15 oz can","walmart":1.25,"ingles":1.59}],"steps":["2 to 4 short steps with temperatures and times"],"little":"one sentence on how to serve it to the toddler","look":""}]}
"walmart" and "ingles" are typical US dollar prices for that package (Ingles runs a little higher). "packs" is how many packages the recipe needs.`;
}

const PROPER = /^(sunday|greek|tuscan|italian|french|thai|mexican|cuban|korean|cajun|swedish|spanish|moroccan|hawaiian|dijon)$/i;
const sentenceCase = name => name.split(' ').map((w, i) => PROPER.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()).join(' ');

async function ideas(request, env, json) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const kind = ['dinner', 'breakfast', 'snack'].includes(body.kind) ? body.kind : 'dinner';
  const catalog = (Array.isArray(body.catalog) ? body.catalog : []).slice(0, 160)
    .map(c => ({ id: str(c.id, 40).replace(/[^A-Za-z0-9_]/g, ''), name: str(c.name, 60) })).filter(c => c.id && c.name);
  const known = new Map(catalog.map(c => [c.id, c.name]));
  const have = (Array.isArray(body.have) ? body.have : []).slice(0, 80).map(id => known.get(str(id, 40))).filter(Boolean);
  const names = list => (Array.isArray(list) ? list : []).slice(0, 80).map(n => str(n, 60)).filter(Boolean);
  const looks = (Array.isArray(body.looks) ? body.looks : []).slice(0, 60)
    .map(l => ({ id: str(l.id, 40).replace(/[^a-z0-9-]/g, ''), name: str(l.name, 60) })).filter(l => l.id && l.name);
  if (!catalog.length || !looks.length) return json({ error: 'bad request' }, 400);

  const cap = parseInt(env.MAX_IDEAS_PER_DAY || '40', 10);
  const day = new Date().toISOString().slice(0, 10);
  if (env.SIMMER_KV) {
    const used = parseInt((await env.SIMMER_KV.get(`ideas:${day}`)) || '0', 10);
    if (used >= cap) return json({ error: "Today's limit for new ideas is used up. It resets tomorrow." }, 429);
    await env.SIMMER_KV.put(`ideas:${day}`, String(used + 1), { expirationTtl: 172800 });
  }

  let text;
  let model = '';
  const avoid = names(body.avoid);
  try { ({ text, model } = await write(env, ideaPrompt(kind, catalog, have, avoid, names(body.loved).slice(0, 12), looks), 3500)); }
  catch (e) { return json({ error: 'The recipe writer is having trouble. Try again in a minute.', detail: String(e.message || e).slice(0, 200) }, 502); }
  const parsed = extractJSON(text);
  if (!parsed || !Array.isArray(parsed.recipes)) return json({ error: 'The ideas came back garbled. Try again.' }, 502);

  const sweet = /\b(sugar|honey|maple|agave|syrup|molasses|ketchup|barbecue|bbq|teriyaki)\b/i;
  const lookIds = new Set(looks.map(l => l.id));
  const recipes = [];
  const taken = new Set(avoid.map(n => n.toLowerCase()));
  for (const r of parsed.recipes.slice(0, 4)) {
    if (recipes.length === 3) break;
    const ings = (Array.isArray(r.ings) ? r.ings : []).slice(0, 10).map(g => {
      const id = known.has(g.id) ? g.id : null;
      const walmart = Math.round(num(g.walmart, 0.25, 40, 2.5) * 100) / 100;
      return {
        id, name: id ? known.get(id) : str(g.name, 40), amount: str(g.amount, 40) || 'to taste', packs: Math.round(num(g.packs, 1, 4, 1)),
        section: SECTIONS.includes(g.section) ? g.section : 'Cans and jars', buy: str(g.buy, 30) || 'each',
        walmart, ingles: Math.round(Math.max(walmart, num(g.ingles, 0.25, 50, walmart * 1.25)) * 100) / 100,
      };
    }).filter(g => g.name);
    const steps = (Array.isArray(r.steps) ? r.steps : []).slice(0, 5).map(t => str(t, 240)).filter(Boolean);
    const name = sentenceCase(str(r.name, 60));
    if (!name || ings.length < 2 || steps.length < 2) continue;
    if (taken.has(name.toLowerCase())) continue; // they already have it
    taken.add(name.toLowerCase());
    if (ings.some(g => !g.id && sweet.test(g.name)) || sweet.test(name)) continue; // breaks the no-sugar rule
    const base = { name, blurb: str(r.blurb, 200), ings, steps, little: str(r.little, 200) || 'Cut small and let it cool.', look: lookIds.has(r.look) ? r.look : looks[0].id };
    recipes.push(kind === 'dinner'
      ? { ...base, hours: Math.round(num(r.hours, 4, 10, 6)), serves: Math.round(num(r.serves, 2, 10, 6)), protein: Math.round(num(r.protein, 5, 70, 30)) }
      : { ...base, method: str(r.method, 60) || 'Oven', makes: str(r.makes, 40) || 'one batch', keeps: str(r.keeps, 120) || 'Fridge 3 days. Freezer 2 months.' });
  }
  if (!recipes.length) return json({ error: 'Nothing usable came back. Try again.' }, 502);
  return json({ recipes, model });
}

function extractJSON(text) {
  if (!text) return null;
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}
