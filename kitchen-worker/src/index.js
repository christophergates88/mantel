// Simmer photo reader: a Cloudflare Worker.
//
// POST /read  { kind: "pantry" | "receipt", images: [base64 JPEG, up to 4], catalog: [{ id, name }] }
//   → { items: [{ id | null, name, price | null }], store: "w" | "i" | null }
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
      return json({ ok: true, reader: env.ANTHROPIC_API_KEY ? 'claude' : env.AI ? 'workers-ai' : 'none' });
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
        if (text.length > 60000) return json({ error: 'too large' }, 413);
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
      text = env.ANTHROPIC_API_KEY ? await askClaude(env, kind, images, catalog) : await askWorkersAI(env, kind, images, catalog);
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

async function askClaude(env, kind, images, catalog) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: env.MODEL || 'claude-haiku-5-5',
      max_tokens: 3000,
      messages: [{ role: 'user', content: [
        ...images.map(data => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } })),
        { type: 'text', text: PROMPT(kind, catalog) },
      ] }],
    }),
  });
  if (!res.ok) throw new Error(`model service ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const data = await res.json();
  return (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
}

async function askWorkersAI(env, kind, images, catalog) {
  if (!env.AI) throw new Error('no reader configured');
  const out = await env.AI.run(env.CF_VISION_MODEL || '@cf/mistralai/mistral-small-3.1-24b-instruct', {
    max_tokens: 3000,
    messages: [{ role: 'user', content: [
      { type: 'text', text: PROMPT(kind, catalog) },
      ...images.map(data => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${data}` } })),
    ] }],
  });
  const text = out?.response ?? out?.choices?.[0]?.message?.content ?? '';
  return typeof text === 'string' ? text : JSON.stringify(text);
}

function extractJSON(text) {
  if (!text) return null;
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}
