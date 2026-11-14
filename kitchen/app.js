// Simmer: a slow cooker kitchen for one household. Kept on the phone, and shared between the family's phones.
// The page's other files are loaded with the same version stamp as this one, so a phone never mixes old and new.
const V = new URL(import.meta.url).search;
const { CATALOG, RECIPES, SECTIONS, PRICED } = await import('./data.js' + V);
const { READER_URL } = await import('./config.js' + V);
const { dish, LOOKS } = await import('./art.js' + V);

const KEY = 'simmer.v2';
const API = READER_URL.replace(/\/$/, '');
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + n.toFixed(2);
const cat = id => { const c = CATALOG[id]; return { id, name: c[0], section: c[1], w: c[2], i: c[3], buy: c[4], staple: !!c[5] }; };
const recipe = id => RECIPES.find(r => r.id === id);
const dinners = () => RECIPES.filter(r => !r.kind && !r.idea);
// A dish shows the family's own photo when they have taken one, otherwise the drawing.
const pic = r => state.photos?.[r.id] && API && !r.idea
  ? `<img class="dish" src="${API}/photo/${state.house}/${r.id}?v=${state.photos[r.id]}" alt="Photo of ${esc(r.name)}" loading="lazy">`
  : dish(r.id, r.name, r.look);
const KID = 'Cason';
const SPECIAL = { '@leftovers': 'Leftovers', '@out': 'Eating out' }; // nights with nothing to cook
const soft = n => /^(Sunday|Greek|Tuscan|Italian|French|Thai|Mexican|Cuban|Korean)\b/.test(n) ? n : n.charAt(0).toLowerCase() + n.slice(1); // mid-sentence
const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

// ---------------------------------------------------------------- dates and times

const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => dayKey(new Date());
function week() {
  const out = [];
  for (let i = 0; i < 7; i++) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + i); out.push({ key: dayKey(d), date: d, i }); }
  return out;
}
const dayName = d => d.i === 0 ? 'Tonight' : d.i === 1 ? 'Tomorrow' : d.date.toLocaleDateString('en-US', { weekday: 'long' });
const dayShort = d => d.i === 0 ? 'Tonight' : d.date.toLocaleDateString('en-US', { weekday: 'short' });
const clock = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
function dinnerAt() {
  const [h, m] = (state.dinner || '17:30').split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0); return d;
}

// ---------------------------------------------------------------- state

const SHARED = ['have', 'extra', 'plan', 'prep', 'stash', 'prices', 'dinner', 'cooking', 'mine', 'items', 'rot', 'rate', 'last', 'log', 'low', 'photos', 'left', 'todo', 'brief', 'briefs', 'updatedAt'];
function newCode() {
  const a = new Uint8Array(20); crypto.getRandomValues(a);
  return [...a].map(n => 'abcdefghjkmnpqrstuvwxyz23456789'[n % 31]).join('');
}
function fresh() {
  const have = {};
  for (const id in CATALOG) if (CATALOG[id][5]) have[id] = true; // the spice shelf starts stocked
  return { have, extra: [], plan: {}, prep: [], stash: {}, mine: [], items: {}, rot: {}, rate: {}, last: null, log: [], low: {}, left: {}, todo: [], photos: {}, brief: '07:00', briefs: {}, prices: {}, dinner: '17:30', cooking: null, house: newCode(), updatedAt: 0 };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.have) return { ...fresh(), ...s };
    const old = JSON.parse(localStorage.getItem('simmer.v1')); // the first version kept a plain list of meals
    if (old && old.have) {
      const plan = {}; const days = week();
      (old.week || []).slice(0, 7).forEach((id, n) => { plan[days[n].key] = id; });
      return { ...fresh(), have: old.have, extra: old.extra || [], prices: old.prices || {}, plan, updatedAt: 1 };
    }
  } catch { /* storage can be unavailable; start a fresh kitchen */ }
  return fresh();
}
let state = { dinner: '17:30' };
state = load();
// Recipes the family kept (state.mine) and ideas being looked at join the built-in ones, with any new ingredients.
let ideas = [];
function hydrate() {
  for (let i = RECIPES.length - 1; i >= 0; i--) if (RECIPES[i].mine || RECIPES[i].idea) RECIPES.splice(i, 1);
  for (const id of Object.keys(CATALOG)) if (id.startsWith('x_')) delete CATALOG[id];
  const addItems = items => { for (const [id, v] of Object.entries(items || {})) if (id.startsWith('x_') && Array.isArray(v) && v.length >= 5) CATALOG[id] = v.slice(0, 5); };
  const fin = n => n === undefined || Number.isFinite(n);
  const ok = r => r && /^[a-z0-9_-]{1,80}$/.test(String(r.id)) && typeof r.name === 'string' && Array.isArray(r.ings) && Array.isArray(r.steps) && fin(r.hours) && fin(r.serves) && fin(r.protein)
    && r.ings.every(g => Array.isArray(g) && CATALOG[g[0]] && (g[2] === undefined || Number.isFinite(g[2]))) && !RECIPES.some(x => x.id === r.id);
  addItems(state.items);
  for (const it of ideas) addItems(it.items);
  for (const r of state.mine || []) if (ok(r)) RECIPES.push({ ...r, mine: true, idea: false });
  for (const it of ideas) if (ok(it.recipe)) RECIPES.push({ ...it.recipe, idea: true });
}
function tidy() {
  for (const k of ['plan', 'stash', 'items', 'rot', 'rate', 'low', 'photos', 'briefs', 'left']) if (!state[k] || typeof state[k] !== 'object') state[k] = {};
  if (!Array.isArray(state.mine)) state.mine = [];
  if (!Array.isArray(state.log)) state.log = [];
  state.todo = (Array.isArray(state.todo) ? state.todo : []).filter(t => typeof t === 'string').slice(0, 60);
  hydrate();
  const real = id => { const r = recipe(id); return r && !r.idea ? r : null; };
  for (const k of Object.keys(state.plan)) if (k < today() || recipe(state.plan[k])?.idea) delete state.plan[k];
  for (const k of Object.keys(state.left)) if (state.plan[k] !== '@leftovers' || !real(state.left[k])) delete state.left[k];
  state.prep = (Array.isArray(state.prep) ? state.prep : []).filter(id => typeof id === 'string' && !recipe(id)?.idea);
  for (const k of Object.keys(state.photos)) state.photos[k] = Number(state.photos[k]) || 0;
  for (const id of Object.keys(state.stash)) if (!/^\d{4}-\d\d-\d\d$/.test(String(state.stash[id]))) delete state.stash[id];
  if (state.cooking && (!Number.isFinite(state.cooking.start) || dayKey(new Date(state.cooking.start)) < today())) state.cooking = null; // yesterday's pot is over
}
tidy();

const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* still works for this visit */ } };
let pushTimer;
function save() {
  state.updatedAt = Date.now();
  state.briefs = briefs();
  keep();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 700);
}

// ---------------------------------------------------------------- sharing between phones

// What this phone last knew the server had (kept on this phone only). A save is refused if someone else saved since.
const shared = () => ({ ...Object.fromEntries(SHARED.map(k => [k, state[k]])), base: state.base || 0 });
function adopt(doc) {
  if (doc.gone) { retired = true; return toast('This kitchen\'s link was replaced. Ask for the new link and paste it under Add another phone.'); }
  for (const k of SHARED) if (k in doc) state[k] = doc[k];
  state.base = doc.updatedAt || 0;
  tidy();
  keep();
  if ($('#sheet').hidden && document.activeElement?.id !== 'extra') render(); else stale = true;
}
let firstPull = null, movedFrom = '', retired = false;
async function push() {
  if (!API || retired) return false;
  try {
    if (firstPull) await firstPull; // never save over the server before having looked at it once
    const r = await fetch(`${API}/house/${state.house}${movedFrom ? '?from=' + movedFrom : ''}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(shared()) });
    const d = await r.json();
    if (d && d.newer) { adopt(d.newer); if (!d.newer.gone) toast('Updated from the other phone'); return true; }
    if (d && d.ok) { state.base = state.updatedAt; movedFrom = ''; keep(); return true; }
    if (d && d.error && r.status === 400) toast(d.error);
  } catch { /* offline: this phone keeps its copy and tries again on the next change */ }
  return false;
}
async function pull() {
  if (!API) return;
  try {
    const doc = await (await fetch(`${API}/house/${state.house}`)).json();
    retired = !!(doc && doc.gone);
    if (retired) return adopt(doc);
    if (doc && doc.updatedAt > (state.base || 0)) {
      const mine = state.updatedAt > (state.base || 0) && state.base; // this phone changed something the server has not seen
      adopt(doc);
      if (mine) toast('Updated from the other phone');
    } else if (!doc || state.updatedAt > (state.base || 0)) { firstPull = null; await push(); }
  } catch { /* offline */ }
}
const joined = location.hash.match(/house=([a-z0-9]{16,32})/);
if (joined && joined[1] !== state.house) { state.house = joined[1]; state.updatedAt = 0; state.base = 0; keep(); }
if (joined) history.replaceState(null, '', location.pathname);

let tab = 'home';
let filter = 'all';
let canWrite = false; // the recipe writer is only offered once the server says it is switched on

// ---------------------------------------------------------------- sums

const price = (id, store) => state.prices[id]?.[store] ?? cat(id)[store];
const fromReceipt = (id, store) => state.prices[id]?.[store] != null;
const missing = r => r.ings.filter(([id]) => !state.have[id]);
const haveCount = r => r.ings.length - missing(r).length;
const cookingNow = () => state.cooking && recipe(state.cooking.id) && !recipe(state.cooking.id).kind ? state.cooking : null;

// What the next seven dinners still need, with packages added up across recipes.
function shopping() {
  const need = new Map();
  for (const d of week()) {
    const r = recipe(state.plan[d.key]);
    if (!r || (d.i === 0 && cookingNow()?.id === r.id)) continue;
    for (const [id, , packs = 1] of r.ings) {
      if (state.have[id]) continue;
      const cur = need.get(id) || { id, packs: 0 };
      cur.packs += packs;
      need.set(id, cur);
    }
  }
  for (const id of state.prep) {
    for (const [iid, , packs = 1] of recipe(id)?.ings || []) {
      if (state.have[iid] || need.has(iid)) continue; // one package covers the weekend baking
      need.set(iid, { id: iid, packs });
    }
  }
  for (const id of Object.keys(state.low)) if (CATALOG[id] && !need.has(id)) need.set(id, { id, packs: 1 }); // staples marked as running low
  const items = [...need.values()].sort((a, b) => SECTIONS.indexOf(cat(a.id).section) - SECTIONS.indexOf(cat(b.id).section));
  const total = store => items.reduce((sum, it) => sum + price(it.id, store) * it.packs, 0);
  return { items, w: total('w'), i: total('i') };
}

// When each meal was last made.
const lastMade = id => { for (let n = state.log.length - 1; n >= 0; n--) if (state.log[n].id === id) return state.log[n].day; return ''; };
const daysSince = id => { const d = lastMade(id); return d ? Math.round((new Date(today()) - new Date(d)) / 864e5) : 999; };
const madeText = id => { const d = lastMade(id); return d ? 'Made ' + new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''; };

// The morning message for each of the next seven days, kept with the kitchen so the server can send it.
function briefs() {
  const out = {};
  for (const d of week()) {
    const v = state.plan[d.key], r = recipe(v);
    let t = '';
    if (v === '@leftovers') t = `Leftovers tonight${leftName(d.key) ? ' (' + soft(leftName(d.key)) + ')' : ''}. Nothing to cook.`;
    else if (v === '@out') t = 'Eating out tonight. Nothing to cook.';
    else if (r) {
      const [h, m] = (state.dinner || '17:30').split(':').map(Number);
      const dinner = new Date(d.date); dinner.setHours(h, m, 0, 0);
      const need = missing(r).length;
      t = `${r.name} tonight. In the pot by ${clock(new Date(dinner - r.hours * 36e5))} to eat at ${clock(dinner)}.${need ? ` Still need ${need} ${need === 1 ? 'thing' : 'things'}.` : ''}`;
    }
    if ([0, 6].includes(d.date.getDay()) && state.prep.length) t += `${t ? ' ' : ''}Weekend prep: ${state.prep.map(id => recipe(id)?.name).filter(Boolean).join(', ')}.`;
    if (t) out[d.key] = t;
  }
  return out;
}

// Fills the open nights: rotation first, nothing made in the last two weeks, long cooks on weekdays, leftovers after a big roast.
function autoplan() {
  const days = week();
  const used = new Set(Object.values(state.plan));
  const hoursLeft = (dinnerAt() - Date.now()) / 36e5;
  let filled = 0, leftovers = 0, lastMeat = '';
  const undo = snap();
  for (const d of days) {
    const prev = recipe(state.plan[days[d.i - 1]?.key]); if (prev) lastMeat = prev.ings[0][0];
    if (state.plan[d.key] || (d.i === 0 && cookingNow())) continue;
    const weekday = d.date.getDay() >= 1 && d.date.getDay() <= 5;
    let pool = dinners().filter(r => !used.has(r.id) && (d.i > 0 || r.hours <= hoursLeft + 0.25));
    if (pool.some(r => daysSince(r.id) > 14)) pool = pool.filter(r => daysSince(r.id) > 14);
    if (!pool.length) continue;
    const score = r => [r.ings[0][0] === lastMeat ? 1 : 0, state.rot[r.id] ? 0 : 1, weekday && r.hours < 8 ? 1 : 0, missing(r).length, -(state.rate[r.id] || 0), -r.protein];
    pool.sort((a, b) => { const x = score(a), y = score(b); for (let n = 0; n < x.length; n++) if (x[n] !== y[n]) return x[n] - y[n]; return 0; });
    const r = pool[0];
    state.plan[d.key] = r.id; used.add(r.id); filled++;
    const next = days[d.i + 1];
    lastMeat = r.ings[0][0];
    if (r.serves >= 8 && next && !state.plan[next.key] && !leftovers) { state.plan[next.key] = '@leftovers'; state.left[next.key] = r.id; filled++; leftovers++; }
  }
  if (!filled) return toast('Every night already has a plan');
  save(); render();
  toast(`Planned ${filled} ${filled === 1 ? 'night' : 'nights'}`, undo);
}

// The best thing to cook tonight when nothing is planned: fewest things to buy, then done by dinner, then protein.
function suggestion() {
  const hoursLeft = (dinnerAt() - Date.now()) / 36e5;
  const late = r => (r.hours > hoursLeft + 0.25 ? 1 : 0);
  const fresh = r => (daysSince(r.id) <= 7 ? 1 : 0); // not what was just eaten
  return dinners().sort((a, b) => late(a) - late(b) || fresh(a) - fresh(b) || missing(a).length - missing(b).length || b.protein - a.protein)[0];
}

function timing(r) {
  const dinner = dinnerAt();
  const startBy = new Date(dinner - r.hours * 36e5);
  if (Date.now() <= startBy) return `Put it on by ${clock(startBy)} to eat at ${clock(dinner)}.`;
  return `Put it on now and it is ready about ${clock(new Date(Date.now() + r.hours * 36e5))}.`;
}

// ---------------------------------------------------------------- views

const stocked = () => Object.keys(CATALOG).filter(id => !id.startsWith('x_') || state.items[id]);
const prepList = () => state.prep.map(recipe).filter(r => r && r.kind);
const onRotation = () => dinners().filter(r => state.rot[r.id]);
// Leftovers only name a meal when someone has said which one they are from.
const leftName = key => { const r = recipe(state.left[key]); return r ? r.name : ''; };
const specialNote = (v, key) => v === '@out' ? 'Nothing to cook' : (leftName(key) ? `From the ${soft(leftName(key))}` : 'Tap to say what they are from');
const BOX = `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" fill="#E9E1D2"/><path d="M11 21h26l-2.5 15a3 3 0 0 1-3 2.5h-15a3 3 0 0 1-3-2.5z" fill="#6E4A2E"/><rect x="9" y="15" width="30" height="6" rx="2" fill="#8A6140"/><rect x="20" y="11" width="8" height="4" rx="1.5" fill="#1E1B18"/></svg>`;

function homeView() {
  const cook = cookingNow();
  const tonight = state.plan[today()];
  const special = !cook && SPECIAL[tonight];
  const planned = recipe(tonight);
  const r = cook ? recipe(cook.id) : planned || suggestion();
  const hoursLeft = (dinnerAt() - Date.now()) / 36e5;
  const ate = !cook && !planned && state.last && state.last.day === today() && recipe(state.last.id);
  const tooLate = !cook && !planned && !special && !ate && r.hours > hoursLeft + 1;
  const next = week().slice(1).map(d => ({ d, r: recipe(state.plan[d.key]), v: state.plan[d.key] })).find(x => x.r || SPECIAL[x.v]);
  const nextLine = next ? (next.r ? `${dayName(next.d)}: ${esc(soft(next.r.name))}, in the pot by ${clock(new Date(dinnerAt() - next.r.hours * 36e5))}.` : `${dayName(next.d)}: ${SPECIAL[next.v].toLowerCase()}.`) : 'Nothing is planned for tomorrow yet.';
  const miss = missing(r).length;
  const spin = onRotation().length ? `<button class="btn ghost" data-spin="${today()}">Surprise me from the rotation</button>` : '';
  let body;
  if (cook) {
    const start = new Date(cook.start), done = new Date(cook.start + r.hours * 36e5);
    const pct = Math.max(3, Math.min(100, Math.round((Date.now() - cook.start) / (r.hours * 36e5) * 100)));
    body = `<p class="kicker">In the pot</p><h2>${esc(r.name)}</h2>
      <p class="when">${Date.now() >= done ? `Ready since ${clock(done)}. It is holding on warm.` : `On since ${clock(start)}. Ready about ${clock(done)}.`}</p>
      <svg class="bar" viewBox="0 0 100 3" preserveAspectRatio="none" role="img" aria-label="${pct} percent of the way there"><rect class="track" width="100" height="3"/><rect class="fill" width="${pct}" height="3"/></svg>
      <div class="acts"><button class="btn brass" data-served="${r.id}">Dinner is served</button><button class="btn ghost" data-open="${r.id}">Recipe</button></div>`;
  } else if (special) {
    body = `<p class="kicker">Tonight</p><h2>${special}</h2>
      <p class="when">${tonight === '@leftovers' && leftName(today()) ? `From the ${esc(soft(leftName(today())))}. ` : ''}The pot gets the night off.</p>
      <div class="acts"><button class="btn ghost" data-pick="${today()}">Change</button></div>`;
  } else if (planned) {
    body = `<p class="kicker">Tonight</p><h2>${esc(r.name)}</h2>
      <p class="when">${timing(r)}</p>
      <p class="stock">${miss ? `Still need ${miss} ${miss === 1 ? 'thing' : 'things'}.` : 'Everything is in the kitchen.'}</p>
      <div class="acts"><button class="btn brass" data-start="${r.id}">It is in the pot</button><button class="btn ghost" data-open="${r.id}">Recipe</button><button class="btn ghost" data-pick="${today()}">Change</button></div>`;
  } else if (ate) {
    body = `<p class="kicker">Dinner is done</p><h2>${esc(ate.name)}</h2>
      <p class="when">${nextLine}</p>
      <div class="acts"><button class="btn ghost" data-open="${ate.id}">Rate it</button><button class="btn ghost" data-pick="${week()[1].key}">Plan tomorrow</button></div>`;
  } else if (tooLate) {
    body = `<p class="kicker">Tonight</p><h2>Too late for the pot</h2>
      <p class="when">Nothing here can be ready by ${clock(dinnerAt())} now.</p>
      <p class="stock">${nextLine}</p>
      <div class="acts"><button class="btn brass" data-plan="${today()}" data-id="@leftovers">Leftovers</button><button class="btn ghost" data-plan="${today()}" data-id="@out">Eating out</button><button class="btn ghost" data-pick="${today()}">Pick a meal anyway</button></div>`;
  } else {
    body = `<p class="kicker">Nothing planned tonight</p><h2>How about ${esc(soft(r.name))}?</h2>
      <p class="when">${timing(r)}</p>
      <p class="stock">${miss ? `You have ${haveCount(r)} of the ${r.ings.length} things it needs.` : 'Everything is in the kitchen.'}</p>
      <div class="acts"><button class="btn brass" data-tonight="${r.id}">Make this tonight</button>${spin}<button class="btn ghost" data-pick="${today()}">Pick something else</button></div>`;
  }
  const shop = shopping();
  return `
  <section class="hero">${special || tooLate ? '' : pic(ate || r)}<div class="panel">${body}</div></section>

  <h2 class="shelf">The week</h2>
  <ul class="days">${week().map(d => {
    const v = state.plan[d.key], p = recipe(v);
    if (SPECIAL[v]) return `<li class="dayrow"><button class="day" ${v === '@leftovers' && !leftName(d.key) ? `data-leftrow="${d.key}"` : `data-pick="${d.key}"`} aria-label="${dayName(d)}: ${SPECIAL[v]}. ${esc(specialNote(v, d.key))}.">
      <span class="dn">${dayShort(d)}</span><span class="thumb">${BOX}</span><span class="meal">${SPECIAL[v]}<small>${esc(specialNote(v, d.key))}</small></span></button>
      <button class="swap" data-pick="${d.key}" aria-label="Change dinner for ${dayName(d)}">Change</button></li>`;
    return p
      ? `<li class="dayrow"><button class="day" data-open="${p.id}" aria-label="${dayName(d)}: ${esc(p.name)}. Open the recipe.">
          <span class="dn">${dayShort(d)}</span><span class="thumb">${pic(p)}</span>
          <span class="meal">${esc(p.name)}<small>${missing(p).length ? missing(p).length + ' to buy' : 'ready to cook'}</small></span></button>
          <button class="swap" data-pick="${d.key}" aria-label="Change dinner for ${dayName(d)}">Change</button></li>`
      : `<li><button class="day" data-pick="${d.key}"><span class="dn">${dayShort(d)}</span><span class="thumb empty"></span><span class="meal none">Add a meal</span></button></li>`; }).join('')}</ul>
  ${week().some(d => !state.plan[d.key]) ? `<button class="btn line wide" data-autoplan>Plan the open nights for me</button>` : ''}
  ${shop.items.length ? `<button class="btn wide" data-tab="list">${shop.items.length} ${shop.items.length === 1 ? 'thing' : 'things'} to buy, about ${money(Math.min(shop.w, shop.i))}</button>` : ''}

  <h2 class="shelf">Weekend prep for ${KID}</h2>
  ${prepList().length ? `<ul class="days">${prepList().map(p => `<li><button class="day prep" data-open="${p.id}">
      <span class="thumb">${pic(p)}</span><span class="meal">${esc(p.name)}<small>${esc(p.method)}${missing(p).length ? `, ${missing(p).length} to buy` : ', ready to make'}</small></span></button></li>`).join('')}</ul>`
    : `<p class="note">Pick a few breakfasts and snacks to batch on Saturday or Sunday. What they need goes on the shopping list.</p>`}
  <button class="btn line wide" data-goto="breakfast">Choose breakfasts and snacks</button>
  ${Object.keys(state.stash).some(recipe) ? `<h2 class="shelf">Made and waiting</h2>
  <ul class="days">${Object.keys(state.stash).filter(recipe).map(id => { const p = recipe(id); const made = new Date(state.stash[id] + 'T12:00:00');
    return `<li class="dayrow"><button class="day prep" data-open="${p.id}"><span class="thumb">${pic(p)}</span>
      <span class="meal">${esc(p.name)}<small>Made ${made.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}. ${esc(p.keeps)}</small></span></button>
      <button class="swap" data-gone="${p.id}" aria-label="${esc(p.name)} is all gone">All gone</button></li>`; }).join('')}</ul>` : ''}

  <h2 class="shelf">Stock the kitchen</h2>
  <div class="snap">
    <button class="btn" data-snap="pantry">Photograph the fridge or pantry</button>
    <button class="btn line" data-snap="receipt">Photograph a receipt</button>
  </div>

  <div class="foot">
    <button class="link" data-dinner>Dinner at ${clock(dinnerAt())}</button>
    <button class="link" data-share-app>Add another phone</button>
  </div>
  <div class="foot one"><button class="link" data-morning>Morning reminder: ${pushIsOn() ? clock(new Date(`2000-01-01T${state.brief || '07:00'}:00`)) : 'off'}</button></div>`;
}

const FILTERS = [['all', 'All'], ['rotation', 'On rotation'], ['ranked', 'Top rated'], ['allday', 'All day, 8+ hrs'], ['ready', 'Have everything'], ['protein', 'Most protein'], ['few', 'Fewest things']];
const starText = n => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';

function recipeRow(r, attr, rank) {
  const m = missing(r).length;
  const tags = [state.rot[r.id] ? 'On rotation' : '', starText(state.rate[r.id]), madeText(r.id), r.mine ? 'Yours' : ''].filter(Boolean);
  return `<li><button class="card" ${attr}>
    <span class="thumb">${pic(r)}</span>
    <span class="txt"><span class="name">${rank ? rank + '. ' : ''}${esc(r.name)}</span>
      ${tags.length ? `<span class="tags">${tags.map(t => `<i>${t}</i>`).join('')}</span>` : ''}
      <span class="meta">${r.kind ? `${esc(r.method)}. Makes ${esc(r.makes)}` : `${r.hours} hrs on low, about ${r.protein} g protein`}</span>
      <span class="have ${m ? '' : 'ok'}">${m ? `You have ${haveCount(r)} of ${r.ings.length}` : 'You have everything'}</span></span>
  </button></li>`;
}

let shelfKind = 'dinner';
const SHELVES = [['dinner', 'Dinners'], ['breakfast', `${KID}'s breakfasts`], ['snack', `${KID}'s snacks`]];
const loved = (a, b) => (state.rot[b.id] ? 1 : 0) - (state.rot[a.id] ? 1 : 0) || (state.rate[b.id] || 0) - (state.rate[a.id] || 0);

function recipesView() {
  const finder = `<label class="find"><span>Find a recipe</span><input id="find" type="search" autocomplete="off" enterkeyhint="search"></label>`;
  const shelves = `<div class="seg" role="group" aria-label="Kind of recipe">${SHELVES.map(([id, label]) =>
    `<button data-shelf="${id}" aria-pressed="${shelfKind === id}">${label}</button>`).join('')}</div>${finder}`;
  const waiting = RECIPES.filter(r => r.idea).length;
  const more = canWrite ? `${waiting ? `<button class="btn wide ideas" data-back-ideas>See the ${waiting} new ${waiting === 1 ? 'idea' : 'ideas'} again</button>` : ''}<button class="btn line wide ideas" data-ideas="${shelfKind}">Give me new ideas</button>` : '';
  if (shelfKind !== 'dinner') {
    const list = RECIPES.filter(r => r.kind === shelfKind && !r.idea).sort(loved);
    return `${shelves}
    <p class="note">Make a batch on the weekend and keep it in the fridge or freezer. Nothing here has added sugar.</p>
    <ul class="cards">${list.map(r => recipeRow(r, `data-open="${r.id}"`)).join('')}</ul>${more}`;
  }
  let list = dinners(), empty = 'Nothing is fully stocked yet. Photograph the fridge and pantry, or tick things off in Kitchen.';
  if (filter === 'rotation') { list = list.filter(r => state.rot[r.id]).sort(loved); empty = 'Nothing is on rotation yet. Open a meal you loved and tap Put on rotation.'; }
  if (filter === 'ranked') { list = list.filter(r => state.rate[r.id]).sort((a, b) => state.rate[b.id] - state.rate[a.id] || loved(a, b)); empty = 'No meals are rated yet. Open a meal and give it stars; the best ones rise to the top here.'; }
  if (filter === 'allday') list = list.filter(r => r.hours >= 8);
  if (filter === 'ready') list = list.filter(r => !missing(r).length);
  if (filter === 'protein') list.sort((a, b) => b.protein - a.protein);
  if (filter === 'few') list.sort((a, b) => a.ings.length - b.ings.length);
  return `${shelves}
  <div class="chips" role="group" aria-label="Filter dinners">
    ${FILTERS.map(([id, label]) => `<button class="chip" data-filter="${id}" aria-pressed="${filter === id}">${label}</button>`).join('')}
  </div>
  ${filter === 'rotation' && list.length ? `<button class="btn wide spin" data-spin="next">Surprise me from the rotation</button>` : ''}
  ${list.length ? `<ul class="cards">${list.map((r, n) => recipeRow(r, `data-open="${r.id}"`, filter === 'ranked' ? n + 1 : 0)).join('')}</ul>` : `<p class="note">${empty}</p>`}
  ${more}`;
}

function kitchenView() {
  return `
  <div class="snap">
    <button class="btn" data-snap="pantry">Photograph the fridge or pantry</button>
    <button class="btn line" data-snap="receipt">Photograph a receipt</button>
  </div>
  <p class="note">Tap anything you have. Recipes and the shopping list follow along.</p>
  ${SECTIONS.map(sec => `
    <h2 class="shelf">${sec}</h2>
    ${sec === 'Staples' ? '<p class="note">Staples have three settings. Tap once for running low (it goes on the shopping list), again for out, again for have.</p>' : ''}
    <div class="pills">${stocked().filter(id => CATALOG[id][1] === sec).map(id =>
      CATALOG[id][5]
        ? `<button class="pill ${state.low[id] ? 'low' : ''}" data-staple="${id}" aria-pressed="${!!state.have[id]}">${esc(CATALOG[id][0])}${state.low[id] ? ', low' : ''}</button>`
        : `<button class="pill" data-have="${id}" aria-pressed="${!!state.have[id]}">${esc(CATALOG[id][0])}</button>`).join('')}</div>
    `).join('')}
  <h2 class="shelf">Other things on hand</h2>
  ${state.extra.length ? `<div class="pills">${state.extra.map((n, i) =>
      `<button class="pill x" data-extra="${i}" aria-pressed="true" aria-label="Remove ${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
  <form class="add" id="addExtra">
    <label for="extra">Add something else</label>
    <div><input id="extra" autocomplete="off" enterkeyhint="done" maxlength="40"><button class="btn small">Add</button></div>
  </form>`;
}

function listView() {
  const shop = shopping();
  const mine = `${state.todo.length ? `<h2 class="shelf">Also on the list</h2><ul class="also">${state.todo.map((t, n) => `<li><button class="tick" data-todo="${n}" aria-label="Bought ${esc(t)}"></button><span>${esc(t)}</span></li>`).join('')}</ul>` : ''}
  <form class="add" id="addTodo"><label for="todo">Add anything else to the list</label>
    <div><input id="todo" autocomplete="off" enterkeyhint="done" maxlength="40" placeholder="Milk, diapers..."><button class="btn small">Add</button></div></form>`;
  if (!shop.items.length) return `<p class="note">${Object.keys(state.plan).length || state.prep.length ? 'Nothing to buy for this week\'s meals. Everything is in the kitchen.' : 'Plan a few dinners on the Tonight screen and what you need shows up here, priced for Walmart and Ingles.'}</p>${mine}`;
  const cheaper = shop.w <= shop.i ? 'Walmart' : 'Ingles';
  return `
  <div class="verdict">
    <p class="kicker">Cheaper this trip</p>
    <p class="pick">${cheaper}</p>
    <p>About ${money(Math.abs(shop.w - shop.i))} less for this list.</p>
    <dl><div><dt>Walmart</dt><dd>${money(shop.w)}</dd></div><div><dt>Ingles</dt><dd>${money(shop.i)}</dd></div></dl>
  </div>
  <button class="btn line wide" data-share-list>Send this list</button>
  <p class="note">Walmart prices were checked ${PRICED} at the Milledgeville store. Ingles prices are estimates until a receipt replaces them, and its weekly meat specials can beat these.</p>
  <table class="buy">
    <thead><tr><th scope="col">Tick off as you buy</th><th scope="col">Walmart</th><th scope="col">Ingles</th></tr></thead>
    <tbody>${shop.items.map(it => {
      const c = cat(it.id), w = price(it.id, 'w') * it.packs, i = price(it.id, 'i') * it.packs;
      return `<tr>
        <th scope="row"><button class="tick" data-bought="${it.id}" aria-label="Bought ${esc(c.name)}"></button>
          <span><span class="name">${esc(c.name)}${it.packs > 1 ? ` <b>x${Number(it.packs)}</b>` : ''}</span><span class="meta">${esc(c.buy)}</span></span></th>
        <td class="${w <= i ? 'win' : ''}">${money(w)}${fromReceipt(it.id, 'w') ? '<i title="From your receipt">r</i>' : ''}</td>
        <td class="${i < w ? 'win' : ''}">${money(i)}${fromReceipt(it.id, 'i') ? '<i title="From your receipt">r</i>' : ''}</td></tr>`; }).join('')}
    </tbody>
  </table>${mine}`;
}

function render() {
  const views = { home: homeView, recipes: recipesView, kitchen: kitchenView, list: listView };
  const chipsAt = $('#view .chips')?.scrollLeft || 0;
  $('#view').innerHTML = views[tab]();
  if ($('#view .chips')) $('#view .chips').scrollLeft = chipsAt;
  const subs = { home: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
                 recipes: `${RECIPES.filter(r => !r.idea).length} recipes, no sugar added`, kitchen: 'What is in the house', list: 'What to buy, and where' };
  $('#sub').textContent = subs[tab];
  document.querySelectorAll('.tabs button').forEach(b => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const n = shopping().items.length + state.todo.length;
  $('#listCount').hidden = !n;
  $('#listCount').textContent = n;
}

// ---------------------------------------------------------------- sheets

let lastFocus = null;
let stale = false; // a sync arrived while a sheet was open or something was being typed
function openSheet(html) {
  if ($('#sheet').hidden) lastFocus = document.activeElement;
  $('#sheet').innerHTML = html;
  $('#sheet').hidden = false; $('#scrim').hidden = false;
  $('#sheet').scrollTop = 0;
  document.body.classList.add('locked');
  $('#view').inert = true; document.querySelector('.tabs').inert = true; document.querySelector('.top').inert = true;
  $('#sheet').querySelector('button, input')?.focus({ preventScroll: true });
}
let busy = false; // a request is in flight; its sheet cannot be dismissed
function closeSheet() {
  if (busy) return;
  $('#view').inert = false; document.querySelector('.tabs').inert = false; document.querySelector('.top').inert = false;
  $('#sheet').hidden = true; $('#scrim').hidden = true;
  document.body.classList.remove('locked');
  lastFocus?.focus?.({ preventScroll: true });
  if (stale) { stale = false; render(); }
}
const closer = `<div class="closebar"><button class="close" data-close aria-label="Close">Close</button></div>`;

function ingList(r) {
  return `<h3>What goes in</h3>
  <ul class="ings">${r.ings.map(([iid, amt]) => `<li class="${state.have[iid] ? 'got' : 'need'}">
    <span>${esc(CATALOG[iid][0])}<small>${esc(amt)}</small></span>
    <button class="flip" data-ing="${iid}" data-rid="${r.id}" aria-label="${esc(CATALOG[iid][0])}: ${state.have[iid] ? 'have it. Tap if you do not' : 'need it. Tap if you have it'}">${state.have[iid] ? 'have' : 'need'}</button></li>`).join('')}</ul>
  <p class="safe">Tap have or need to correct it.</p>
  <h3>How</h3>
  <ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
}

// Rotation and stars, shown on every recipe.
function lovedRow(r) {
  const n = state.rate[r.id] || 0;
  return `<div class="loved">
    <button class="btn ${state.rot[r.id] ? 'brass' : 'line'}" data-rot="${r.id}" aria-pressed="${!!state.rot[r.id]}">${state.rot[r.id] ? 'On rotation' : 'Put on rotation'}</button>
    <div class="rate" role="group" aria-label="Rate this meal out of five">${[1, 2, 3, 4, 5].map(k =>
      `<button data-rate="${k}" data-rid="${r.id}" aria-pressed="${k <= n}" aria-label="${k} ${k === 1 ? 'star' : 'stars'}">${k <= n ? '★' : '☆'}</button>`).join('')}</div>
  </div>
  <p class="safe">Rotation is your list of keepers. Surprise me picks from it.</p>`;
}
const ideaActs = r => `<div class="acts two"><button class="btn" data-keep-idea="${r.id}">Keep this recipe</button><button class="btn line" data-back-ideas>Back to the ideas</button></div>`;
const unproven = r => r.mine || r.idea ? `<p class="safe">This one was written on request and has not been test-cooked. Check the times the first time you make it. Chicken and turkey are done at 165°F, ground meat at 160°F, pork and beef roasts at 145°F.</p>` : '';
const dropper = r => r.mine ? `<button class="link drop" data-drop="${r.id}">Remove this recipe</button>` : '';

function prepSheet(r) {
  const on = state.prep.includes(r.id), made = state.stash[r.id];
  openSheet(`${closer}
  <div class="art">${pic(r)}</div>
  <h2 id="sheetTitle">${esc(r.name)}</h2>
  <p class="facts">${esc(r.method)}. Makes ${esc(r.makes)}.${madeText(r.id) ? ' ' + madeText(r.id) + '.' : ''}</p>
  ${r.idea || !API ? '' : `<div class="shots"><button class="link" data-shot="${r.id}">${state.photos[r.id] ? 'Retake my photo' : 'Use my own photo'}</button>${state.photos[r.id] ? `<button class="link" data-unshot="${r.id}">Go back to the drawing</button>` : ''}</div>`}
  <p class="blurb">${esc(r.blurb)}</p>
  ${r.idea ? ideaActs(r) : `<div class="acts two">
    <button class="btn ${on ? 'line' : ''}" data-prep="${r.id}">${on ? 'Take off weekend prep' : 'Add to weekend prep'}</button>
    <button class="btn line" data-made="${r.id}">${made ? 'Made another batch' : 'I made a batch'}</button>
  </div>${lovedRow(r)}`}
  ${ingList(r)}
  <p class="little"><b>Keeping it.</b> ${esc(r.keeps)} Cool completely before it goes in a bag or box.</p>
  <p class="little"><b>For ${KID}.</b> ${esc(r.little)}</p>
  ${unproven(r)}${dropper(r)}`);
}

function recipeSheet(id) {
  const r = recipe(id);
  if (!r) return closeSheet();
  if (r.kind) return prepSheet(r);
  openSheet(`${closer}
  <div class="art">${pic(r)}</div>
  <h2 id="sheetTitle">${esc(r.name)}</h2>
  <p class="facts">${r.hours} hours on low. Serves ${r.serves}. About ${r.protein} g protein a serving.${madeText(r.id) ? ' ' + madeText(r.id) + '.' : ''}</p>
  ${r.idea || !API ? '' : `<div class="shots"><button class="link" data-shot="${r.id}">${state.photos[r.id] ? 'Retake my photo' : 'Use my own photo'}</button>${state.photos[r.id] ? `<button class="link" data-unshot="${r.id}">Go back to the drawing</button>` : ''}</div>`}
  <p class="blurb">${esc(r.blurb)}</p>
  ${r.idea ? ideaActs(r) : `${lovedRow(r)}
  <h3>Cook it on</h3>
  <div class="chips wrap">${week().map(d => `<button class="chip" data-plan="${d.key}" data-id="${r.id}" aria-pressed="${state.plan[d.key] === r.id}">${d.i < 2 ? dayName(d) : d.date.toLocaleDateString('en-US', { weekday: 'short' })}${state.plan[d.key] && state.plan[d.key] !== r.id ? '<small> taken</small>' : ''}</button>`).join('')}</div>`}
  ${ingList(r)}
  <p class="little"><b>For ${KID}.</b> ${esc(r.little)} Salt the grown-up plates at the table.</p>
  <p class="safe">Thaw meat before it goes in. ${r.hours >= 8 ? 'Most slow cookers switch to warm on their own, so a long work day is fine.' : 'If you will be out longer than this, set it to switch to warm.'}</p>
  ${unproven(r)}${dropper(r)}`);
}

function pickSheet(key) {
  const d = week().find(x => x.key === key);
  if (!d) return closeSheet(); // the day rolled over while this was open
  const cur = state.plan[key];
  const byStock = (a, b) => missing(a).length - missing(b).length || b.protein - a.protein;
  const rot = onRotation().sort(byStock), rest = dinners().filter(r => !state.rot[r.id]).sort(byStock);
  const row = r => recipeRow(r, `data-plan="${key}" data-id="${r.id}" ${cur === r.id ? 'aria-current="true"' : ''}`);
  openSheet(`${closer}
  <h2 id="sheetTitle">${d.i === 0 ? 'Dinner tonight' : 'Dinner ' + (d.i === 1 ? 'tomorrow' : 'on ' + dayName(d))}</h2>
  <div class="acts two quick">
    <button class="btn line" data-plan="${key}" data-id="@leftovers" ${cur === '@leftovers' ? 'aria-current="true"' : ''}>Leftovers</button>
    <button class="btn line" data-plan="${key}" data-id="@out" ${cur === '@out' ? 'aria-current="true"' : ''}>Eating out</button>
    ${cur ? `<button class="btn line" data-plan="${key}" data-id="">Clear this night</button>` : ''}
  </div>
  ${rot.length ? `<h3>On rotation</h3>
  <button class="btn wide spin" data-spin="${key}">Surprise me from the rotation</button>
  <ul class="cards tight">${rot.map(row).join('')}</ul>
  <h3>Everything else</h3>` : `<p class="blurb">Fewest things to buy first.</p>`}
  <ul class="cards tight">${rest.map(row).join('')}</ul>`);
}

// Choosing Leftovers asks which meal they are from, listing this week's dinners and the most recent ones first.
function leftSheet(key) {
  const d = week().find(x => x.key === key);
  if (!d) return closeSheet(); // the day rolled over while this was open
  const recent = [...new Set([...week().filter(x => x.i < d.i).map(x => state.plan[x.key]), ...[...state.log].reverse().map(l => l.id)])]
    .map(recipe).filter(r => r && !r.kind && !r.idea);
  const rest = dinners().filter(r => !recent.includes(r)).sort((a, b) => a.name.localeCompare(b.name));
  const row = r => `<li><button class="card" data-left="${key}" data-id="${r.id}" ${state.left[key] === r.id ? 'aria-current="true"' : ''}><span class="thumb">${pic(r)}</span><span class="txt"><span class="name">${esc(r.name)}</span>${madeText(r.id) ? `<span class="meta">${madeText(r.id)}</span>` : ''}</span></button></li>`;
  openSheet(`${closer}
  <h2 id="sheetTitle">Leftovers from what?</h2>
  <button class="btn line wide" data-left="${key}" data-id="">Just leftovers, do not name a meal</button>
  ${recent.length ? `<h3>This week and lately</h3><ul class="cards tight">${recent.map(row).join('')}</ul><h3>Everything else</h3>` : ''}
  <ul class="cards tight">${rest.map(row).join('')}</ul>`);
}

function servedSheet(id) {
  const r = recipe(id);
  const used = r.ings.filter(([iid]) => !cat(iid).staple && state.have[iid]);
  openSheet(`${closer}
  <h2 id="sheetTitle">Enjoy dinner</h2>
  <p class="blurb">How was the ${esc(soft(r.name))}? Rate it, and put it on rotation if you would make it again.</p>
  ${lovedRow(r)}
  <h3>What got used up?</h3>
  <p class="blurb">${used.length ? 'Anything ticked comes off the kitchen list.' : 'Nothing to clear from the kitchen list.'}</p>
  <ul class="found">${used.map(([iid]) => `<li><label><input type="checkbox" data-used="${iid}" ${['Meat', 'Produce', 'Cans and jars'].includes(cat(iid).section) ? 'checked' : ''}>
    <span>${esc(CATALOG[iid][0])}</span></label></li>`).join('')}</ul>
  <button class="btn wide" data-clear="${id}">Done</button>`);
}

// ---------------------------------------------------------------- new ideas

let ideasKind = 'dinner';
function fromIdea(x, kind) {
  const items = {}, ings = [], seen = new Set();
  for (const g of x.ings) {
    let id = CATALOG[g.id] ? g.id : 'x_' + slug(g.name);
    if (!id || id === 'x_' || seen.has(id)) continue;
    seen.add(id);
    if (id.startsWith('x_')) items[id] = CATALOG[id] || [g.name, g.section, g.walmart, g.ingles, g.buy];
    ings.push(g.packs > 1 ? [id, g.amount, g.packs] : [id, g.amount]);
  }
  const base = { id: 'm_' + slug(x.name) + '_' + Math.random().toString(36).slice(2, 6), name: x.name, blurb: x.blurb, ings, steps: x.steps, little: x.little, look: x.look };
  const recipeOut = kind === 'dinner' ? { ...base, hours: x.hours, serves: x.serves, protein: x.protein } : { ...base, kind, method: x.method, makes: x.makes, keeps: x.keeps };
  return { recipe: recipeOut, items };
}

async function askIdeas(kind) {
  ideasKind = kind;
  const what = kind === 'dinner' ? 'dinners' : kind === 'breakfast' ? 'breakfasts' : 'snacks';
  if (!API) return openSheet(`${closer}<h2 id="sheetTitle">New ideas are not switched on yet</h2>`);
  busy = true;
  openSheet(`<h2 id="sheetTitle">Writing three new ${what}</h2><p class="blurb">To your rules: healthy, no added sugar, low prep, few ingredients. About 20 seconds.</p><div class="working" aria-hidden="true"></div>`);
  try {
    if (!state.base) await push();
    const same = RECIPES.filter(r => !r.idea && (kind === 'dinner' ? !r.kind : r.kind === kind));
    const res = await fetch(API + '/ideas', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        house: state.house, kind, catalog: Object.keys(CATALOG).map(id => ({ id, name: CATALOG[id][0] })),
        have: Object.keys(state.have).filter(id => CATALOG[id] && !CATALOG[id][5]),
        avoid: [...same, ...ideas.map(i => i.recipe)].map(r => r.name),
        loved: same.filter(r => state.rot[r.id] || state.rate[r.id] >= 4).map(r => r.name),
        looks: same.filter(r => LOOKS.includes(r.id)).map(r => ({ id: r.id, name: r.name })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.recipes) || !data.recipes.length) { const err = new Error(data.error || 'No ideas came back. Try again.'); err.final = res.status === 429; throw err; }
    ideas = data.recipes.map(x => fromIdea(x, kind)).filter(i => i.recipe.ings.length >= 2);
    hydrate(); busy = false;
    ideasSheet();
  } catch (e) {
    busy = false;
    openSheet(`${closer}<h2 id="sheetTitle">No ideas this time</h2>
      <p class="blurb">${esc(e.message && !/fetch/i.test(e.message) ? e.message : 'Check the connection and try again.')}</p>
      ${e.final ? '<button class="btn wide" data-close>OK</button>' : `<button class="btn wide" data-ideas="${kind}">Try again</button>`}`);
  }
}
function ideasSheet() {
  const list = RECIPES.filter(r => r.idea);
  if (!list.length) return closeSheet();
  openSheet(`${closer}
  <h2 id="sheetTitle">${list.length === 1 ? 'One new idea' : list.length + ' new ideas'}</h2>
  <p class="blurb">Written just now and not test-cooked. Open one to read it, and keep the ones you like.</p>
  <ul class="cards tight">${list.map(r => recipeRow(r, `data-open="${r.id}"`)).join('')}</ul>
  <button class="btn line wide" data-ideas="${ideasKind}">Try three more</button>`);
}
function keepIdea(id) {
  const n = ideas.findIndex(i => i.recipe.id === id);
  if (n < 0) return;
  const [it] = ideas.splice(n, 1);
  state.mine.push(it.recipe);
  Object.assign(state.items, it.items);
  hydrate(); save(); render();
  if (RECIPES.some(r => r.idea)) ideasSheet(); else recipeSheet(id);
  toast('Kept. It is on the shelf now.');
}
function dropMine(id) {
  state.mine = state.mine.filter(r => r.id !== id);
  const used = new Set(state.mine.flatMap(r => r.ings.map(g => g[0])));
  for (const k of Object.keys(state.items)) if (!used.has(k)) { delete state.items[k]; delete state.have[k]; }
  delete state.rot[id]; delete state.rate[id];
  tidy(); save(); closeSheet(); render();
  toast('Recipe removed');
}

// Plans a random rotation dinner for a night, skipping ones already on this week when it can.
function spin(key) {
  const days = week();
  if (key === 'next') { const open = days.find(d => !state.plan[d.key] && !(d.i === 0 && (cookingNow() || (dinnerAt() - Date.now()) / 36e5 < 4))); if (!open) return toast('Every night already has a plan'); key = open.key; }
  if (!days.some(d => d.key === key)) { closeSheet(); return; }
  if (key === today() && cookingNow()) return toast('Tonight\'s dinner is already in the pot');
  const planned = new Set(Object.values(state.plan));
  let pool = onRotation().filter(r => r.id !== state.plan[key]);
  if (pool.some(r => daysSince(r.id) > 14)) pool = pool.filter(r => daysSince(r.id) > 14);
  if (pool.some(r => !planned.has(r.id))) pool = pool.filter(r => !planned.has(r.id));
  if (!pool.length) return toast('Nothing else is on rotation yet');
  const r = pool[Math.floor(Math.random() * pool.length)];
  state.plan[key] = r.id;
  if (key === today() && state.cooking && state.cooking.id !== r.id) state.cooking = null;
  save(); closeSheet(); render();
  const d = days.find(x => x.key === key);
  toast(`${r.name} for ${d.i === 0 ? 'tonight' : d.i === 1 ? 'tomorrow' : dayName(d)}`);
}

// ---------------------------------------------------------------- photos

let snapKind = 'pantry';
let shotFor = ''; // the recipe a dish photo is being taken for

async function saveShot(id, file) {
  try {
    const b64 = await shrink(file, 900);
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const res = await fetch(`${API}/photo/${state.house}/${id}`, { method: 'PUT', headers: { 'content-type': 'image/jpeg' }, body: bytes });
    if (!res.ok) throw new Error();
    state.photos[id] = Date.now();
    save(); render();
    if (!$('#sheet').hidden) recipeSheet(id);
    toast('Your photo is on this recipe now');
  } catch { toast('That photo could not be saved. Try again.'); }
}

// ---------------------------------------------------------------- morning reminder (a notification, sent by the server)

const pushIsOn = () => { try { return localStorage.getItem('simmer.push') === '1'; } catch { return false; } };
const notePush = on => { try { localStorage.setItem('simmer.push', on ? '1' : '0'); } catch { /* no storage */ } };
const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const swUrl = () => `sw.js?api=${encodeURIComponent(API)}&house=${state.house}`;
async function pushState() {
  if (!canPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}
// If this phone has the reminder on, make sure the server and the background helper know the current kitchen.
async function resub(oldCode = '') {
  try {
    const sub = await pushState();
    if (!sub) return;
    const post = (what, code) => fetch(`${API}/push/${what}/${code}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
    if (oldCode && oldCode !== state.house) await post('unsub', oldCode);
    await navigator.serviceWorker.register(swUrl());
    await post('sub', state.house);
  } catch { /* the reminder screen will show its real state */ }
}
async function morningSheet(note = '') {
  const sub = await pushState().catch(() => null);
  notePush(!!sub);
  openSheet(`${closer}<h2 id="sheetTitle">Morning reminder</h2>
    <p class="blurb">A notification each morning with what is for dinner and when the pot needs to go on. Nothing is sent on days with no plan.</p>
    ${note ? `<p class="little">${esc(note)}</p>` : ''}
    <label class="time">Send it at <input type="time" id="briefTime" value="${esc(state.brief || '07:00')}"></label>
    ${!canPush() ? `<p class="little">This only works when Simmer is opened from its home screen icon (iPhone needs iOS 16.4 or newer). Add it to the home screen, open it from there, and come back to this screen.</p>`
      : sub ? `<p class="little"><b>On for this phone.</b> Each phone turns it on for itself.</p>
        <button class="btn wide" data-push-test>Send a test now</button><button class="btn line wide" data-push-off>Turn off on this phone</button>`
      : `<button class="btn wide" data-push-on>Turn on for this phone</button>`}
    `);
}
async function pushOn() {
  try {
    if (await Notification.requestPermission() !== 'granted') return morningSheet('Notifications are blocked for Simmer. Allow them in the phone\'s Settings, then try again.');
    const reg = await navigator.serviceWorker.register(swUrl());
    await navigator.serviceWorker.ready;
    const { key } = await (await fetch(API + '/push/key')).json();
    const raw = Uint8Array.from(atob(key.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    const res = await fetch(`${API}/push/sub/${state.house}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '');
    notePush(true); save(); render();
    morningSheet('Turned on. Send a test to see it arrive.');
  } catch (e) {
    try { await (await pushState())?.unsubscribe(); } catch { /* nothing to undo */ }
    morningSheet(e.message || 'It could not be turned on. Try again.');
  }
}
async function pushOff() {
  try {
    const sub = await pushState();
    if (sub) {
      await fetch(`${API}/push/unsub/${state.house}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe();
    }
  } catch { /* already off */ }
  notePush(false); render();
  morningSheet('Turned off on this phone.');
}
async function pushTest() {
  save(); clearTimeout(pushTimer); await push();
  const res = await fetch(`${API}/push/test/${state.house}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(r => r.json()).catch(() => ({}));
  const ok = (res.sent || []).some(c => c >= 200 && c < 300);
  morningSheet(ok ? 'Test sent. It should arrive within a few seconds.' : (res.error || 'The test could not be sent. Turn it off and on again, then retry.'));
}

function shrink(file, max = 1400) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.72).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be opened.')); };
    img.src = url;
  });
}

async function readPhotos(files) {
  const what = snapKind === 'receipt' ? 'receipt' : 'photos';
  busy = true;
  openSheet(`<h2 id="sheetTitle">Reading the ${what}</h2><p class="blurb">This takes a few seconds.</p><div class="working" aria-hidden="true"></div>`);
  try {
    if (!state.base) await push(); // the server only reads photos for a kitchen it has seen
    const images = await Promise.all([...files].slice(0, 4).map(f => shrink(f)));
    const res = await fetch(API + '/read', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ house: state.house, kind: snapKind, images, catalog: stocked().map(id => ({ id, name: CATALOG[id][0] })) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The photo reader did not answer. Try again in a minute.');
    busy = false;
    reviewSheet(data);
    if (files.length > 4) toast('Only the first 4 photos were read');
  } catch (e) {
    busy = false;
    openSheet(`${closer}<h2 id="sheetTitle">The ${what} could not be read</h2>
      <p class="blurb">${esc(e.message && !/fetch/i.test(e.message) ? e.message : 'Check the connection and try again.')}</p>
      <p class="blurb">You can still tick things off by hand in Kitchen.</p>`);
  }
}

let pending = null;
function reviewSheet(data) {
  const items = (data.items || []).filter(it => it && (CATALOG[it.id] || it.name));
  pending = { items, store: data.store };
  if (!items.length) {
    return openSheet(`${closer}<h2 id="sheetTitle">Nothing recognised</h2>
      <p class="blurb">Try again with more light, and the shelves or the receipt filling the frame.</p>`);
  }
  const storeName = { w: 'Walmart', i: 'Ingles' }[data.store];
  openSheet(`${closer}
  <h2 id="sheetTitle">Found ${items.length} ${items.length === 1 ? 'thing' : 'things'}</h2>
  <p class="blurb">Untick anything that is wrong.${storeName ? ` Prices from this ${storeName} receipt replace the estimates.` : ''}</p>
  <ul class="found">${items.map((it, n) => `<li><label><input type="checkbox" checked data-n="${n}">
    <span>${esc(CATALOG[it.id] ? CATALOG[it.id][0] : it.name)}</span>
    ${it.price ? `<em>${money(Number(it.price))}</em>` : ''}</label></li>`).join('')}</ul>
  <button class="btn wide" data-keep>Add to the kitchen</button>`);
}

function keepFound() {
  let n = 0;
  document.querySelectorAll('.found input:checked').forEach(box => {
    const it = pending.items[+box.dataset.n];
    if (CATALOG[it.id]) {
      state.have[it.id] = true;
      const p = Number(it.price);
      if (pending.store && p > 0 && p < 200) state.prices[it.id] = { ...state.prices[it.id], [pending.store]: p };
    } else {
      const name = String(it.name).trim().slice(0, 40);
      if (name && !state.extra.some(x => x.toLowerCase() === name.toLowerCase())) state.extra.push(name);
    }
    n++;
  });
  save(); closeSheet(); render();
  toast(`Added ${n} to the kitchen`);
}

// ---------------------------------------------------------------- sending things

async function send(payload, copied) {
  try {
    if (navigator.share) return await navigator.share(payload);
    await navigator.clipboard.writeText(payload.url || payload.text);
    toast(copied);
  } catch (e) { if (e.name !== 'AbortError') toast('Could not share from this browser'); }
}
function listText() {
  const shop = shopping();
  const store = shop.w <= shop.i ? 'Walmart' : 'Ingles';
  return `Grocery list (${store} is cheaper, about ${money(Math.min(shop.w, shop.i))}):\n` +
    [...shop.items.map(it => `- ${cat(it.id).name}${it.packs > 1 ? ' x' + it.packs : ''} (${cat(it.id).buy})`), ...state.todo.map(t => `- ${t}`)].join('\n');
}

// ---------------------------------------------------------------- events

let toastTimer, undoWith = null;
function toast(msg, undo = null) {
  const t = $('#toast');
  undoWith = undo;
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-undo>Undo</button>' : ''}`;
  t.classList.add('on'); t.classList.toggle('high', !$('#sheet').hidden);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.classList.remove('on'); undoWith = null; }, undo ? 6000 : 3200);
}
// A copy of the kitchen from just before a one-tap change, so it can be put back.
const snap = () => { const was = JSON.stringify(Object.fromEntries(SHARED.filter(k => k !== 'updatedAt').map(k => [k, state[k]]))); return () => { Object.assign(state, JSON.parse(was)); tidy(); save(); render(); toast('Put back'); }; };

document.addEventListener('click', e => {
  if (e.target.id === 'scrim') return closeSheet();
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if ('undo' in d) { const u = undoWith; undoWith = null; $('#toast').classList.remove('on'); return u && u(); }
  if ('close' in d) return closeSheet();
  if (d.tab) { tab = d.tab; render(); window.scrollTo(0, 0); return; }
  if (d.filter) { filter = d.filter; render(); return; }
  if (d.shelf) { shelfKind = d.shelf; render(); return; }
  if (d.rot) {
    if (state.rot[d.rot]) delete state.rot[d.rot]; else state.rot[d.rot] = true;
    save();
    const on = !!state.rot[d.rot];
    b.textContent = on ? 'On rotation' : 'Put on rotation';
    b.setAttribute('aria-pressed', on); b.classList.toggle('brass', on); b.classList.toggle('line', !on);
    render();
    return toast(on ? 'On rotation' : 'Taken off rotation');
  }
  if (d.rate) {
    const n = +d.rate;
    if (state.rate[d.rid] === n) delete state.rate[d.rid]; else state.rate[d.rid] = n;
    save();
    b.parentElement.querySelectorAll('button').forEach(x => { const on = +x.dataset.rate <= (state.rate[d.rid] || 0); x.setAttribute('aria-pressed', on); x.textContent = on ? '★' : '☆'; });
    return render();
  }
  if (d.spin) return spin(d.spin);
  if (d.ideas) return askIdeas(d.ideas);
  if (d.keepIdea) return keepIdea(d.keepIdea);
  if ('backIdeas' in d) return ideasSheet();
  if (d.drop) {
    if (b.dataset.sure) return dropMine(d.drop);
    b.dataset.sure = '1'; b.textContent = 'Tap again to remove it for good';
    return;
  }
  if (d.goto) { tab = 'recipes'; shelfKind = d.goto; render(); window.scrollTo(0, 0); return; }
  if (d.prep) {
    const on = state.prep.includes(d.prep);
    state.prep = on ? state.prep.filter(x => x !== d.prep) : [...state.prep, d.prep];
    save(); closeSheet(); render();
    return toast(on ? 'Taken off weekend prep' : 'Added to weekend prep');
  }
  if (d.made) {
    state.stash[d.made] = today();
    state.prep = state.prep.filter(x => x !== d.made);
    save(); closeSheet(); render();
    return toast('Marked as made today');
  }
  if (d.gone) { delete state.stash[d.gone]; save(); return render(); }
  if (d.open) return recipeSheet(d.open);
  if (d.pick) return pickSheet(d.pick);
  if (d.plan) {
    const was = state.plan[d.plan];
    if (d.id === '@leftovers' && was === '@leftovers') return leftSheet(d.plan);
    const undoPlan = snap();
    if (!d.id || was === d.id) delete state.plan[d.plan]; else state.plan[d.plan] = d.id;
    if (d.plan === today() && state.cooking && state.cooking.id !== state.plan[d.plan]) state.cooking = null;
    if (d.id === '@leftovers' && state.plan[d.plan] === '@leftovers') { save(); return leftSheet(d.plan); }
    delete state.left[d.plan];
    save();
    if (b.classList.contains('chip')) {
      b.setAttribute('aria-pressed', state.plan[d.plan] === d.id); render();
      const day = week().find(x => x.key === d.plan), old = SPECIAL[was] || recipe(was)?.name;
      if (day && state.plan[d.plan] && old && was !== d.id) toast(`${dayName(day)}: replaced ${soft(old)}`, undoPlan);
      return;
    }
    closeSheet(); render();
    return toast(state.plan[d.plan] ? `${SPECIAL[d.id] || recipe(d.id).name} is planned` : 'Night left open');
  }
  if (d.leftrow) return leftSheet(d.leftrow);
  if (d.left) {
    if (d.id) state.left[d.left] = d.id; else delete state.left[d.left];
    save(); closeSheet(); render();
    return toast(d.id ? `Leftovers from the ${soft(recipe(d.id).name)}` : 'Leftovers planned');
  }
  if (d.tonight) { state.plan[today()] = d.tonight; save(); render(); return toast('Planned for tonight'); }
  if (d.start) { for (const [iid] of recipe(d.start).ings) state.have[iid] = true; state.plan[today()] = d.start; state.cooking = { id: d.start, start: Date.now() }; save(); render(); return toast('Timer started'); }
  if (d.served) return servedSheet(d.served);
  if (d.clear) {
    document.querySelectorAll('[data-used]:checked').forEach(box => { delete state.have[box.dataset.used]; });
    state.last = { id: d.clear, day: today() };
    const potDay = state.cooking && Number.isFinite(state.cooking.start) ? dayKey(new Date(state.cooking.start)) : today();
    state.last = { id: d.clear, day: potDay };
    state.log = [...state.log, { id: d.clear, day: potDay }].slice(-300);
    state.cooking = null; if (state.plan[potDay] === d.clear) delete state.plan[potDay];
    save(); closeSheet(); render(); return;
  }
  if (d.have) {
    if (state.have[d.have]) delete state.have[d.have]; else state.have[d.have] = true;
    save(); b.setAttribute('aria-pressed', !!state.have[d.have]);
    const n = shopping().items.length; $('#listCount').hidden = !n; $('#listCount').textContent = n;
    return;
  }
  if (d.ing) {
    if (state.have[d.ing]) delete state.have[d.ing]; else state.have[d.ing] = true;
    delete state.low[d.ing];
    save();
    const top = $('#sheet').scrollTop;
    recipeSheet(d.rid); $('#sheet').scrollTop = top;
    $(`#sheet [data-ing="${d.ing}"]`)?.focus({ preventScroll: true });
    return render();
  }
  if (d.extra) { const undo = snap(); const [gone] = state.extra.splice(+d.extra, 1); save(); render(); return toast(`${gone} removed`, undo); }
  if (d.bought) { const undo = snap(); state.have[d.bought] = true; delete state.low[d.bought]; save(); render(); return toast('Bought', undo); }
  if (d.todo) { const undo = snap(); state.todo.splice(+d.todo, 1); save(); render(); return toast('Bought', undo); }
  if (d.staple) {
    const id = d.staple;
    if (state.low[id]) { delete state.low[id]; delete state.have[id]; }      // low -> out
    else if (state.have[id]) state.low[id] = true;                            // have -> running low
    else state.have[id] = true;                                               // out -> have
    save(); return render();
  }
  if ('autoplan' in d) return autoplan();
  if (d.shot) { shotFor = d.shot; $('#photo').removeAttribute('multiple'); $('#photo').value = ''; $('#photo').click(); return; }
  if (d.unshot) {
    delete state.photos[d.unshot]; save();
    fetch(`${API}/photo/${state.house}/${d.unshot}`, { method: 'DELETE' }).catch(() => {});
    recipeSheet(d.unshot); return render();
  }
  if ('morning' in d) return morningSheet();
  if ('pushOn' in d) return pushOn();
  if ('pushOff' in d) return pushOff();
  if ('pushTest' in d) return pushTest();
  if ('relink' in d) {
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to cut off the old link'; return; }
    const old = state.house;
    movedFrom = old; state.house = newCode(); state.base = 0; state.photos = {};
    save(); clearTimeout(pushTimer); closeSheet(); render();
    push().then(ok => { if (ok) fetch(`${API}/house/${old}`, { method: 'DELETE' }).catch(() => {}); resub(old); });
    return toast('New link made. Send it to the phones you want.');
  }
  if (d.snap) {
    shotFor = ''; $('#photo').setAttribute('multiple', '');
    snapKind = d.snap;
    if (!API) return openSheet(`${closer}<h2 id="sheetTitle">Photos are not switched on yet</h2><p class="blurb">Until then, tick things off by hand in Kitchen.</p>`);
    $('#photo').value = ''; $('#photo').click();
    return;
  }
  if ('keep' in d) return keepFound();
  if ('shareList' in d) return send({ text: listText() }, 'List copied');
  if ('shareApp' in d) {
    return openSheet(`${closer}<h2 id="sheetTitle">Add another phone</h2>
      <p class="blurb">Send this link to the other phone and open it there. Both phones then show the same dinners, kitchen and shopping list.</p>
      <p class="blurb">Anyone with the link can see and change this kitchen, so only send it to family.</p>
      <button class="btn wide" data-send-link>Send the link</button>
      <h3>Joining from another phone?</h3>
      <p class="blurb">On an iPhone, a link opened in Safari does not reach the home screen app. Copy the link, open Simmer from its icon, and paste it here.</p>
      <form class="add" id="joinForm"><label for="joinCode">Paste the link you were sent</label>
        <div><input id="joinCode" autocomplete="off" autocapitalize="none" spellcheck="false"><button class="btn small">Join</button></div></form>
      <h3>Shared it with the wrong person?</h3>
      <p class="blurb">Make a new link. The old one stops working for every other phone, so you will need to send the new one again. Your own dish photos are not carried over.</p>
      <button class="link drop" data-relink>Make a new link</button>`);
  }
  if ('sendLink' in d) return send({ title: 'Simmer', url: `${location.origin}${location.pathname}#house=${state.house}` }, 'Link copied');
  if ('dinner' in d) {
    return openSheet(`${closer}<h2 id="sheetTitle">What time is dinner?</h2>
      <p class="blurb">Simmer works back from this to tell you when the pot needs to go on.</p>
      <label class="time">Dinner time <input type="time" id="dinnerTime" value="${esc(state.dinner)}"></label>
      <button class="btn wide" data-set-dinner>Save</button>`);
  }
  if ('setBrief' in d) {
    const v = $('#briefTime').value;
    if (/^\d\d:\d\d$/.test(v)) { state.brief = v; save(); }
    closeSheet(); render(); return toast('Reminder time saved');
  }
  if ('setDinner' in d) {
    const v = $('#dinnerTime').value;
    if (/^\d\d:\d\d$/.test(v)) { state.dinner = v; save(); }
    closeSheet(); render(); return toast('Dinner time saved');
  }
});

$('#photo').addEventListener('change', e => {
  if (!e.target.files.length) return;
  if (shotFor) return saveShot(shotFor, e.target.files[0]);
  readPhotos(e.target.files);
});

document.addEventListener('submit', e => {
  if (e.target.id === 'joinForm') {
    e.preventDefault();
    const m = $('#joinCode').value.trim().toLowerCase().match(/(?:house=)?([a-z0-9]{16,32})\s*$/);
    if (!m) return toast('That does not look like a Simmer link');
    if (m[1] === state.house) { closeSheet(); return toast('This phone is already in that kitchen'); }
    const old = state.house;
    state.house = m[1]; state.updatedAt = 0; state.base = 0; keep(); closeSheet();
    firstPull = pull().finally(() => { firstPull = null; resub(old); });
    return toast('Joining that kitchen');
  }
  if (e.target.id === 'addTodo') {
    e.preventDefault();
    const t = $('#todo').value.trim();
    if (t && !state.todo.some(x => x.toLowerCase() === t.toLowerCase())) state.todo.push(t);
    save(); render(); $('#todo')?.focus();
    return;
  }
  if (e.target.id !== 'addExtra') return;
  e.preventDefault();
  const name = $('#extra').value.trim();
  if (!name) return;
  if (!state.extra.some(x => x.toLowerCase() === name.toLowerCase())) state.extra.push(name);
  save(); render(); $('#extra').focus();
});

document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) return;
  try {
    const v = (await (await fetch('version.txt', { cache: 'no-store' })).text()).trim();
    if (v && V && '?v=' + encodeURIComponent(v) !== V && $('#sheet').hidden && document.activeElement?.id !== 'extra') return location.reload();
  } catch { /* offline: carry on with this copy */ }
  tidy(); pull();
  if ($('#sheet').hidden) render();
});
setInterval(() => { if (tab === 'home' && $('#sheet').hidden && !document.hidden) render(); }, 60000);

keep();
render();
firstPull = pull().finally(() => { firstPull = null; });
// Ask the server whether the recipe writer is on; remember the answer so a dropped connection does not hide the button.
try { canWrite = localStorage.getItem('simmer.writer') === '1'; } catch { /* no storage */ }
async function checkWriter(tries = 3) {
  if (!API) return;
  try {
    const j = await (await fetch(API + '/health')).json();
    const was = canWrite;
    canWrite = j.writer === 'claude';
    try { localStorage.setItem('simmer.writer', canWrite ? '1' : '0'); } catch { /* no storage */ }
    if (canWrite !== was && tab === 'recipes' && $('#sheet').hidden) render();
  } catch { if (tries > 1) setTimeout(() => checkWriter(tries - 1), 4000); }
}
checkWriter();
resub();

document.addEventListener('change', e => {
  if (e.target.id === 'briefTime' && /^\d\d:\d\d$/.test(e.target.value)) { state.brief = e.target.value; save(); stale = true; toast('Reminder time saved'); }
});
// Search box on the recipe shelves: hides cards that do not match, without redrawing.
document.addEventListener('input', e => {
  if (e.target.id !== 'find') return;
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#view .cards > li').forEach(li => { li.hidden = !!q && !li.querySelector('.name').textContent.toLowerCase().includes(q); });
});
