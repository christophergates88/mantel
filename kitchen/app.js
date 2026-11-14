// Simmer: a slow cooker kitchen for one household. Kept on the phone, and shared between the family's phones.
// The page's other files are loaded with the same version stamp as this one, so a phone never mixes old and new.
const V = new URL(import.meta.url).search;
const { CATALOG, RECIPES, SECTIONS, PRICED, PRICED_ON, WM, SIZE } = await import('./data.js' + V);
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
// The next two weeks, starting today. Most of the app looks at the first seven days; the planner can look at both weeks.
function days(n = 14) {
  const out = [];
  for (let i = 0; i < n; i++) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + i); out.push({ key: dayKey(d), date: d, i }); }
  return out;
}
const week = () => days(7);
const wd = (d, len) => d.date.toLocaleDateString('en-US', { weekday: len });
const dayName = d => d.i === 0 ? 'Tonight' : d.i === 1 ? 'Tomorrow' : d.i < 7 ? wd(d, 'long') : d.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const dayShort = d => d.i === 0 ? 'Tonight' : d.i < 7 ? wd(d, 'short') : `${wd(d, 'short')} ${d.date.getDate()}`;
const ago = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} ${Math.round(m / 1440) === 1 ? 'day' : 'days'} ago`; };
const clock = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
function dinnerAt() {
  const [h, m] = (state.dinner || '17:30').split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0); return d;
}

// ---------------------------------------------------------------- state

const SHARED = ['have', 'extra', 'plan', 'prep', 'stash', 'packs', 'prices', 'dinner', 'cooking', 'mine', 'items', 'rot', 'rate', 'kid', 'notes', 'last', 'log', 'low', 'photos', 'left', 'todo', 'acts', 'alerts', 'thaws', 'brief', 'briefs', 'nudges', 'updatedAt'];
function newCode() {
  const a = new Uint8Array(20); crypto.getRandomValues(a);
  return [...a].map(n => 'abcdefghjkmnpqrstuvwxyz23456789'[n % 31]).join('');
}
function fresh() {
  const have = {};
  for (const id in CATALOG) if (CATALOG[id][5]) have[id] = true; // the spice shelf starts stocked
  return { have, extra: [], plan: {}, prep: [], stash: {}, packs: {}, mine: [], items: {}, rot: {}, rate: {}, kid: {}, notes: {}, last: null, log: [], low: {}, left: {}, todo: [], acts: [], photos: {}, alerts: {}, thaws: {}, brief: '07:00', briefs: {}, nudges: [], prices: {}, dinner: '17:30', cooking: null, house: newCode(), updatedAt: 0 };
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
  for (const k of ['plan', 'stash', 'packs', 'items', 'rot', 'rate', 'kid', 'notes', 'low', 'photos', 'briefs', 'left', 'alerts', 'thaws', 'prices', 'have']) if (!state[k] || typeof state[k] !== 'object' || Array.isArray(state[k])) state[k] = {};
  state.extra = (Array.isArray(state.extra) ? state.extra : []).filter(t => typeof t === 'string');
  state.acts = (Array.isArray(state.acts) ? state.acts : []).filter(a => a && Number.isFinite(a.t) && typeof a.m === 'string').sort((a, b) => a.t - b.t).slice(-40);
  if (!Array.isArray(state.mine)) state.mine = [];
  if (!Array.isArray(state.log)) state.log = [];
  state.todo = (Array.isArray(state.todo) ? state.todo : []).filter(t => typeof t === 'string').slice(0, 60);
  hydrate();
  const real = id => { const r = recipe(id); return r && !r.idea ? r : null; };
  for (const k of Object.keys(state.plan)) if (k < today() || recipe(state.plan[k])?.idea) delete state.plan[k];
  for (const k of Object.keys(state.left)) if (state.plan[k] !== '@leftovers' || !real(state.left[k])) delete state.left[k];
  for (const k of Object.keys(state.thaws)) if (state.plan[k.slice(0, 10)] !== k.slice(11)) delete state.thaws[k];
  state.prep = [...new Set((Array.isArray(state.prep) ? state.prep : []).filter(id => typeof id === 'string' && !recipe(id)?.idea))];
  for (const id of Object.keys(state.packs)) if (!/^\d{4}-\d\d-\d\d$/.test(String(state.packs[id])) || (recipe(id) && !recipe(id).pack)) delete state.packs[id];
  for (const k of Object.keys(state.photos)) state.photos[k] = Number(state.photos[k]) || 0;
  for (const id of Object.keys(state.stash)) if (!/^\d{4}-\d\d-\d\d$/.test(String(state.stash[id]))) delete state.stash[id];
  if (state.cooking && (!Number.isFinite(state.cooking.start) || dayKey(new Date(state.cooking.start)) < today())) state.cooking = null; // yesterday's pot is over
}
tidy();

const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* still works for this visit */ } };
let pushTimer;
function save() {
  state.updatedAt = Math.max(Date.now(), (state.base || 0) + 1);
  state.briefs = briefs();
  state.nudges = nudges();
  keep();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 700);
}

// ---------------------------------------------------------------- sharing between phones

// What this phone last knew the server had (kept on this phone only). A save is refused if someone else saved since.
const shared = () => ({ ...Object.fromEntries(SHARED.map(k => [k, state[k]])), base: state.base || 0 });
// A copy of the kitchen as the server last had it. When both phones change things at the same time, or one was out of
// signal in the store, their changes are combined entry by entry instead of one phone's work being dropped.
let baseDoc = null;
try { baseDoc = JSON.parse(localStorage.getItem('simmer.base')); } catch { /* none yet */ }
const keepBase = doc => {
  const text = JSON.stringify(doc);
  baseDoc = JSON.parse(text); // its own copy, so later changes on this phone do not alter it
  try { localStorage.setItem('simmer.base', text); } catch { /* no room: sharing still works */ }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const WHOLE = ['cooking', 'last', 'dinner', 'brief']; // settings that change as one piece
function combine(mine, base, theirs) {
  const out = {};
  for (const k of SHARED) {
    if (['updatedAt', 'briefs', 'nudges'].includes(k)) continue;
    const l = mine[k], b = base ? base[k] : undefined, r = theirs[k];
    if (r === undefined || same(r, b)) { out[k] = l; continue; }   // only this phone changed it
    if (same(l, b)) { out[k] = r; continue; }                      // only the other phone changed it
    if (Array.isArray(l) && Array.isArray(r)) {                    // a list both changed: additions from both, minus what either removed
      const id = x => JSON.stringify(x), B = new Set((Array.isArray(b) ? b : []).map(id)), L = new Set(l.map(id)), R = new Set(r.map(id));
      out[k] = [...r.filter(x => L.has(id(x)) || !B.has(id(x))), ...l.filter(x => !R.has(id(x)) && !B.has(id(x)))];
      if (k === 'acts') out[k].sort((x, y) => x.t - y.t);
      if (k === 'log') out[k].sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : 0));
    } else if (!WHOLE.includes(k) && l && r && typeof l === 'object' && typeof r === 'object' && !Array.isArray(l) && !Array.isArray(r)) {
      const o = { ...r }, bb = b && typeof b === 'object' ? b : {};  // a set of entries both changed: this phone's own changes win, entry by entry
      for (const e of new Set([...Object.keys(l), ...Object.keys(bb)])) {
        if (same(l[e], bb[e])) continue;
        if (e in l) o[e] = l[e]; else delete o[e];
      }
      out[k] = o;
    } else out[k] = l;                                             // one setting changed on both: this phone's stands
  }
  return out;
}
const actKeys = () => new Set(state.acts.map(a => `${a.t}:${a.w}:${a.n || 1}`));
// Says what the other phone just did, when there is something to say.
function announce(seen, fallback) {
  const a = [...state.acts].reverse().find(x => !seen.has(`${x.t}:${x.w}:${x.n || 1}`) && (x.w || '') !== who);
  if (a) toast(`${a.w || 'The other phone'} ${actText(a)}`);
  else if (fallback) toast('Updated from the other phone');
}
function adopt(doc) {
  if (doc.gone) { retired = true; return toast('This kitchen\'s link was replaced. Ask for the new link and paste it under Add another phone.'); }
  for (const k of SHARED) if (k in doc) state[k] = doc[k];
  state.base = doc.updatedAt || 0;
  keepBase(doc);
  tidy();
  keep();
  if ($('#sheet').hidden && !typing()) render(); else stale = true;
}
// The server has a newer kitchen than this phone last saw. Returns true when this phone still has changes to send back.
function take(doc) {
  if (doc.gone) { adopt(doc); return false; }
  const seen = actKeys();
  const dirty = !!state.base && state.updatedAt > state.base;      // this phone changed something the server has not seen
  if (!dirty || !baseDoc) { adopt(doc); announce(seen, dirty); return false; }
  const merged = combine(state, baseDoc, doc);
  for (const k of Object.keys(merged)) state[k] = merged[k];
  state.base = doc.updatedAt || 0;
  keepBase(doc);
  tidy();
  state.updatedAt = Math.max(Date.now(), state.base + 1);
  state.briefs = briefs(); state.nudges = nudges();
  keep();
  if ($('#sheet').hidden && !typing()) render(); else stale = true;
  announce(seen, false);
  return true;
}
const typing = () => ['extra', 'todo', 'noteText', 'ownText', 'whoName', 'find'].includes(document.activeElement?.id);
let firstPull = null, movedFrom = '', retired = false;
async function push(again = 0) {
  if (!API || retired) return false;
  try {
    if (firstPull) await firstPull; // never save over the server before having looked at it once
    const sent = shared();
    const r = await fetch(`${API}/house/${state.house}${movedFrom ? '?from=' + movedFrom : ''}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sent) });
    const d = await r.json();
    if (d && d.newer) { if (take(d.newer) && again < 2) return push(again + 1); return true; }
    if (d && d.ok) { state.base = sent.updatedAt; delete sent.base; keepBase(sent); movedFrom = ''; keep(); return true; }
    if (d && d.error && (r.status === 400 || r.status === 429)) toast(d.error);
  } catch { /* offline: this phone keeps its copy and tries again on the next change or when the signal is back */ }
  return false;
}
async function pull() {
  if (!API) return;
  try {
    const doc = await (await fetch(`${API}/house/${state.house}`)).json();
    retired = !!(doc && doc.gone);
    if (retired) return adopt(doc);
    if (doc && doc.updatedAt > (state.base || 0)) { if (take(doc)) { firstPull = null; await push(); } }
    else if (!doc || state.updatedAt > (state.base || 0)) { firstPull = null; await push(); }
  } catch { /* offline */ }
}
const joined = location.hash.match(/house=([a-z0-9]{16,32})/);
if (joined && joined[1] !== state.house) { state.house = joined[1]; state.updatedAt = 0; state.base = 0; keep(); }
if (joined) history.replaceState(null, '', location.pathname);

// Whose phone this is (kept on this phone only), so the list of recent changes can say who did what.
let who = '';
try { who = (localStorage.getItem('simmer.who') || '').slice(0, 20); } catch { /* no storage */ }
// Adds a line to the kitchen's recent changes. A run of the same small change (ticking things off) is kept as one line with a count.
function note(msg, key = '') {
  const t = Date.now(), last = state.acts[state.acts.length - 1];
  if (key && last && last.k === key && (last.w || '') === who && t - last.t < 15 * 60000) { last.n = (last.n || 1) + 1; last.t = t; last.m = msg; }
  else state.acts.push({ t, w: who, m: msg, ...(key ? { k: key } : {}) });
  state.acts = state.acts.slice(-40);
}
const actText = a => String(a.m).replace('#', a.n > 1 ? `${a.n} things` : '1 thing');

let tab = 'home';
let filter = 'all';
let canWrite = false; // the recipe writer is only offered once the server says it is switched on

// ---------------------------------------------------------------- sums

// A price paid on a receipt beats the catalog. For Ingles, once a few receipts are in, the remaining estimates follow
// what this family's own receipts show Ingles charging compared with Walmart.
const fromReceipt = (id, store) => state.prices[id]?.[store] != null;
function inglesGap() {
  const gaps = Object.entries(state.prices).filter(([id, p]) => CATALOG[id] && p && p.i > 0).map(([id, p]) => p.i / (p.w > 0 ? p.w : cat(id).w)).sort((a, b) => a - b);
  return gaps.length < 4 ? 0 : Math.max(0.85, Math.min(1.6, gaps[Math.floor(gaps.length / 2)]));
}
let gap = 0; // refreshed on every redraw
const price = (id, store) => state.prices[id]?.[store] ?? (store === 'i' && gap ? Math.round((state.prices[id]?.w ?? cat(id).w) * gap * 100) / 100 : cat(id)[store]);
// What a dinner still needs. With a freezer pack made, only the things that stay out of the bag count.
const packOf = r => (r && r.pack && state.packs[r.id] ? r.pack : null);
const needs = r => (packOf(r) ? r.ings.filter(([id]) => packOf(r).includes(id)) : r.ings);
// One pack covers one night: the first night that dinner is planned.
const packOn = (r, key) => (packOf(r) && days(14).find(d => state.plan[d.key] === r.id)?.key === key ? r.pack : null);
const missingOn = (r, key) => (packOn(r, key) ? needs(r) : r.ings).filter(([id]) => !state.have[id]);
const missing = r => needs(r).filter(([id]) => !state.have[id]);
const haveCount = r => r.ings.length - missing(r).length;
const meatOf = r => { const g = r.ings.find(([id]) => CATALOG[id] && CATALOG[id][1] === 'Meat'); return g ? CATALOG[g[0]][0].split(',')[0].toLowerCase() : ''; };
const thawDays = r => (r.kind ? 0 : r.thaw ?? (meatOf(r) ? 1 : 0)); // nights in the fridge a frozen roast or freezer pack needs
let span = 7; // how many days the shopping list covers
try { span = localStorage.getItem('simmer.span') === '14' ? 14 : 7; } catch { /* no storage */ }
const cookingNow = () => state.cooking && recipe(state.cooking.id) && !recipe(state.cooking.id).kind ? state.cooking : null;

// How much of a package a recipe uses, so two dinners that each need part of one share it on the list.
const UNITS = { lb: 'lb', cup: 'cup', cups: 'cup', oz: 'oz', clove: 'clove', cloves: 'clove', can: 'can', cans: 'can', jar: 'jar', jars: 'jar', bag: 'bag', bags: 'bag', slice: 'slice', slices: 'slice', handful: 'handful', handfuls: 'handful', tbsp: 'tbsp' };
function share(id, amount, packs) {
  if (packs) return packs; // the recipe says how many to buy
  const size = SIZE[id], m = /^(?:juice of )?(\d+ \d\/\d|\d+\/\d|\d+(?:\.\d+)?)(?: to (\d+(?:\.\d+)?))?\s*([a-z]+)?/i.exec(String(amount).trim());
  if (!size || !m) return 1;
  const qty = m[2] ? +m[2] : m[1].split(' ').reduce((sum, part) => sum + (part.includes('/') ? part.split('/')[0] / part.split('/')[1] : +part), 0);
  const per = size[UNITS[(m[3] || '').toLowerCase()] || 'each'];
  return per && qty > 0 ? qty / per : 1;
}
// What the planned dinners still need (this week, or two weeks), with packages added up across recipes.
function shopping() {
  gap = inglesGap();
  const need = new Map();
  const add = (id, packs) => { const cur = need.get(id) || { id, packs: 0 }; cur.packs += packs; need.set(id, cur); };
  const planned = new Set();
  for (const d of days(span)) {
    const r = recipe(state.plan[d.key]);
    if (!r || (d.i === 0 && cookingNow()?.id === r.id)) continue;
    planned.add(r.id);
    for (const [id, amt, packs] of missingOn(r, d.key)) add(id, share(id, amt, packs));
  }
  for (const id of state.prep) {
    const r = recipe(id);
    if (!r) continue;
    if (!r.kind) { // a dinner being made ahead as a freezer pack: what goes in the bag
      if (!r.pack || planned.has(r.id)) continue;
      for (const [iid, amt, packs] of r.ings) if (!state.have[iid] && !r.pack.includes(iid)) add(iid, share(iid, amt, packs));
      continue;
    }
    for (const [iid, amt, packs] of r.ings) if (!state.have[iid]) add(iid, share(iid, amt, packs));
  }
  for (const it of need.values()) it.packs = Math.max(1, Math.ceil(it.packs - 1e-6)); // parts of packages round up to whole ones
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

// The alerts the server should send, each with the moment it is due. Worked out here because the phone knows the
// plan, the dinner time and what is in the pot; the server only watches the clock.
const ALERTS = [['morning', 'Morning plan', 'What is for dinner and when the pot goes on.'], ['start', 'Start the pot', '20 minutes before it has to go on, if nobody has tapped It is in the pot.'],
  ['ready', 'Dinner is ready', 'When the cooking time is up.'], ['thaw', 'Thaw tonight', '8 PM the night before a dinner with meat. Two nights before for big roasts.']];
const alertOn = k => state.alerts[k] !== false;
function thawText(r, d, n, nights) {
  const when = nights > 1 ? `on ${wd(d, 'long')}` : 'tomorrow';
  const tail = n > 1 ? (nights > 1 ? ' It needs two nights to thaw.' : ' It usually needs two nights, so check it has thawed before it goes in.') : '';
  return `${r.name} is ${when}. ${packOn(r, d.key) ? 'Move the freezer pack to the fridge tonight.' : `If the ${meatOf(r)} is frozen, move it to the fridge tonight.`}${tail}`;
}
// Dinners coming up whose meat should move to the fridge tonight.
function thawTonight() {
  return days(3).slice(1).map(d => ({ d, r: recipe(state.plan[d.key]) })).filter(x => x.r && !x.r.kind && thawDays(x.r) >= x.d.i);
}
const thawLine = x => `Move the ${packOn(x.r, x.d.key) ? 'freezer pack' : meatOf(x.r)} for ${x.d.i === 1 ? 'tomorrow' : wd(x.d, 'long')}'s ${soft(x.r.name)} to the fridge${packOn(x.r, x.d.key) ? '' : ' if it is frozen'}.`;
function nudges() {
  const out = [], now = Date.now(), bs = briefs();
  const at = (date, hhmm, shift = 0) => { const [h, m] = String(hhmm).split(':').map(Number); const t = new Date(date); t.setDate(t.getDate() + shift); t.setHours(h || 0, m || 0, 0, 0); return t.getTime(); };
  const pot = cookingNow();
  for (const d of days(9)) {
    const r = recipe(state.plan[d.key]);
    if (d.i < 7 && alertOn('morning') && bs[d.key]) out.push({ k: 'morning', at: at(d.date, state.brief || '07:00'), t: bs[d.key] });
    if (!r || r.kind || (d.i === 0 && pot && pot.id === r.id)) continue;
    const dinner = at(d.date, state.dinner || '17:30'), startBy = dinner - r.hours * 36e5;
    if (d.i < 7 && alertOn('start') && !(d.i === 0 && pot)) out.push({ k: 'start', at: startBy - 20 * 60000, t: `${r.name} needs to be in the pot by ${clock(new Date(startBy))} to eat at ${clock(new Date(dinner))}.` });
    const n = thawDays(r);
    if (n && alertOn('thaw')) {
      // The night is chosen once, when the dinner is first planned: as many nights ahead as it needs, or the soonest night left.
      const memo = `${d.key}:${r.id}`;
      if (!state.thaws[memo]) { let k = n; while (k > 1 && at(d.date, '20:00', -k) < now) k--; state.thaws[memo] = at(d.date, '20:00', -k); }
      out.push({ k: 'thaw', at: state.thaws[memo], t: thawText(r, d, n, Math.round((at(d.date, '20:00') - state.thaws[memo]) / 864e5)) });
    }
  }
  if (pot && alertOn('ready')) { const r = recipe(pot.id); out.push({ k: 'ready', at: pot.start + r.hours * 36e5, t: `${r.name} has had its ${r.hours} hours. Dinner is ready when you are.` }); }
  // Anything due more than 45 minutes ago has been sent already or missed its moment.
  return out.filter(n => n.at > now - 45 * 60000).sort((a, b) => a.at - b.at).slice(0, 40);
}

// Fills the open nights: rotation first, nothing made in the last two weeks, long cooks on weekdays, leftovers after a big roast.
function autoplan(from = 0, to = 7) {
  const days_ = days(14);
  const used = new Set(Object.values(state.plan));
  const hoursLeft = (dinnerAt() - Date.now()) / 36e5;
  let filled = 0, leftovers = 0, lastMeat = '';
  const undo = snap();
  const meats = {}; // how often each main ingredient is already on this stretch
  for (const d of days_.slice(from, to)) { const r = recipe(state.plan[d.key]); if (r) meats[r.ings[0][0]] = (meats[r.ings[0][0]] || 0) + 1; }
  for (const d of days_.slice(from, to)) {
    const prev = recipe(state.plan[days_[d.i - 1]?.key]); if (prev) lastMeat = prev.ings[0][0];
    if (state.plan[d.key] || (d.i === 0 && cookingNow())) continue;
    const weekday = d.date.getDay() >= 1 && d.date.getDay() <= 5;
    let pool = dinners().filter(r => !used.has(r.id) && (d.i > 0 || r.hours <= hoursLeft + 0.25));
    if (pool.some(r => daysSince(r.id) > 14)) pool = pool.filter(r => daysSince(r.id) > 14);
    if (!pool.length) continue;
    const score = r => [r.ings[0][0] === lastMeat ? 1 : 0, state.kid[r.id] === 'no' ? 1 : 0, state.rot[r.id] ? 0 : 1, meats[r.ings[0][0]] || 0, weekday && r.hours < 8 ? 1 : 0, packOf(r) ? 0 : 1, missing(r).length, -(state.rate[r.id] || 0), -r.protein];
    pool.sort((a, b) => { const x = score(a), y = score(b); for (let n = 0; n < x.length; n++) if (x[n] !== y[n]) return x[n] - y[n]; return 0; });
    const r = pool[0];
    state.plan[d.key] = r.id; used.add(r.id); filled++;
    meats[r.ings[0][0]] = (meats[r.ings[0][0]] || 0) + 1;
    const next = d.i + 1 < to ? days_[d.i + 1] : null;
    lastMeat = r.ings[0][0];
    if (r.serves >= 8 && next && !state.plan[next.key] && !leftovers) { state.plan[next.key] = '@leftovers'; state.left[next.key] = r.id; filled++; leftovers++; }
  }
  if (!filled) return toast('Every night already has a plan');
  note(`planned ${filled} ${filled === 1 ? 'night' : 'nights'}${from ? ' of next week' : ''} with Plan it for me`);
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
const prepList = () => state.prep.map(recipe).filter(r => r && (r.kind || r.pack));
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
  const missed = !cook && planned && planned.hours > hoursLeft + 1; // tonight's dinner was planned but never went on
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
  } else if (missed) {
    body = `<p class="kicker">Tonight</p><h2>Too late for the ${esc(soft(r.name))}</h2>
      <p class="when">Started now, it would not be ready until ${clock(new Date(Date.now() + r.hours * 36e5))}.</p>
      <p class="stock">Move it to tomorrow and the dinners planned after it slide back a day too.</p>
      <div class="acts"><button class="btn brass" data-slide="${today()}">Move it to tomorrow</button><button class="btn ghost" data-start-back="${r.id}">It is already on</button><button class="btn ghost" data-pick="${today()}">Change</button></div>`;
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
  const all = days(14);
  const nextPlanned = all.slice(7).filter(d => state.plan[d.key]).length;
  const jobs = thawTonight();
  const stashed = Object.keys(state.stash).filter(recipe), packed = Object.keys(state.packs).filter(recipe);
  const recent = [...state.acts].reverse().slice(0, 5);
  return `
  <section class="hero">${special || tooLate ? '' : pic(ate || r)}<div class="panel">${body}</div></section>
  ${jobs.length ? `<p class="little jobs"><b>One job tonight.</b> ${jobs.map(x => esc(thawLine(x))).join(' ')}</p>` : ''}
  ${setupCard()}

  <h2 class="shelf">The week</h2>
  <ul class="days">${all.slice(0, 7).map(dayRow).join('')}</ul>
  ${all.slice(0, 7).some(d => !state.plan[d.key]) ? `<button class="btn line wide" data-autoplan="this">Plan the open nights for me</button>` : ''}
  ${shop.items.length ? `<button class="btn wide" data-tab="list">${shop.items.length} ${shop.items.length === 1 ? 'thing' : 'things'} to buy, about ${money(Math.min(shop.w, shop.i))}</button>` : ''}
  <button class="btn line wide" data-next-week aria-expanded="${showNext}">${showNext ? 'Hide next week' : `Next week${nextPlanned ? `: ${nextPlanned} planned` : ''}`}</button>
  ${showNext ? `<h2 class="shelf">Next week</h2>
  <ul class="days">${all.slice(7).map(dayRow).join('')}</ul>
  ${all.slice(7).some(d => !state.plan[d.key]) ? `<button class="btn line wide" data-autoplan="next">Plan next week for me</button>` : ''}` : ''}

  <h2 class="shelf">Weekend prep</h2>
  ${prepList().length ? `<ul class="days">${prepList().map(p => `<li><button class="day prep" data-open="${p.id}">
      <span class="thumb">${pic(p)}</span><span class="meal">${esc(p.name)}<small>${p.kind ? esc(p.method) : 'Freezer pack'}${prepMissing(p) ? `, ${prepMissing(p)} to buy` : ', ready to make'}</small></span></button></li>`).join('')}</ul>`
    : `<p class="note">Pick breakfasts and snacks for ${KID} to batch on Saturday or Sunday, or dinners to bag up raw as freezer packs. What they need goes on the shopping list.</p>`}
  <div class="snap gap"><button class="btn line" data-goto="breakfast">Choose breakfasts and snacks</button><button class="btn line" data-goto-packs>Choose freezer packs</button></div>
  ${stashed.length || packed.length ? `<h2 class="shelf">Made and waiting</h2>
  <ul class="days">${packed.map(id => { const p = recipe(id);
    return `<li class="dayrow"><button class="day prep" data-open="${p.id}"><span class="thumb">${pic(p)}</span>
      <span class="meal">${esc(p.name)}<small>Freezer pack, frozen ${shortDate(state.packs[id])}. Needs ${thawDays(p) > 1 ? 'two nights' : 'a night'} in the fridge first.</small></span></button>
      <button class="swap" data-unpack="${p.id}" aria-label="The ${esc(p.name)} freezer pack is used up">Used</button></li>`; }).join('')}${stashed.map(id => { const p = recipe(id); const made = new Date(state.stash[id] + 'T12:00:00');
    return `<li class="dayrow"><button class="day prep" data-open="${p.id}"><span class="thumb">${pic(p)}</span>
      <span class="meal">${esc(p.name)}<small>Made ${made.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}. ${esc(p.keeps)}</small></span></button>
      <button class="swap" data-gone="${p.id}" aria-label="${esc(p.name)} is all gone">All gone</button></li>`; }).join('')}</ul>` : ''}

  <h2 class="shelf">Stock the kitchen</h2>
  <div class="snap">
    <button class="btn" data-snap="pantry">Photograph the fridge or pantry</button>
    <button class="btn line" data-snap="receipt">Photograph a receipt</button>
  </div>

  ${recent.length ? `<h2 class="shelf">Lately</h2>
  <ul class="lately">${recent.map(actRow).join('')}</ul>
  ${state.acts.length > 5 ? `<button class="link" data-acts>See everything lately</button>` : ''}` : ''}

  <div class="foot">
    <button class="link" data-dinner>Dinner at ${clock(dinnerAt())}</button>
    <button class="link" data-share-app>Add another phone</button>
  </div>
  <div class="foot">
    <button class="link" data-morning>Alerts: ${pushIsOn() ? 'on' : 'off'}</button>
    <button class="link" data-who-ask>${who ? `This phone: ${esc(who)}` : 'Name this phone'}</button>
  </div>`;
}
let showNext = false;
// One short prompt at a time for a phone that is new to Simmer: whose it is, then the home screen, then alerts.
const hinted = k => { try { return localStorage.getItem('simmer.hint.' + k) === '1'; } catch { return true; } };
function setupCard() {
  if (!who) return `<div class="whose"><p><b>Whose phone is this?</b> Then Simmer can say who changed what.</p>
    <div class="acts"><button class="btn small" data-who="Katie">Katie</button><button class="btn small" data-who="Chris">Chris</button><button class="btn small line" data-who-ask>Someone else</button></div></div>`;
  const iPhone = /iPhone|iPad|iPod/.test(navigator.userAgent), asApp = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (iPhone && !asApp && !hinted('home')) return `<div class="whose hint"><p><b>Put Simmer on your home screen.</b> Tap the Share button at the bottom of Safari, then Add to Home Screen. It opens like an app from there, and alerts only work that way.</p>
    <div class="acts"><button class="btn small line" data-hint="home">Got it</button></div></div>`;
  if ((asApp || !iPhone) && canPush() && !pushIsOn() && !hinted('alerts')) return `<div class="whose hint"><p><b>Want a nudge when the pot needs to go on?</b> Simmer can send the morning plan, a reminder to start the pot, and a reminder the night before to thaw the meat.</p>
    <div class="acts"><button class="btn small" data-morning>Set up alerts</button><button class="btn small line" data-hint="alerts">Not now</button></div></div>`;
  return '';
}
// Moves a dinner to the next night. The dinners planned straight after it move back a day too, up to the first open night.
function slide(key) {
  const all = days(14), at = all.findIndex(d => d.key === key);
  if (at < 0 || !state.plan[key]) return closeSheet();
  let end = at;
  while (end < all.length && state.plan[all[end].key]) end++;
  if (end >= all.length) return toast('There is no open night in the next two weeks to move it into');
  const undo = snap(), name = SPECIAL[state.plan[key]] || recipe(state.plan[key])?.name || 'dinner';
  for (let n = end; n > at; n--) {
    const to = all[n].key, from = all[n - 1].key;
    state.plan[to] = state.plan[from];
    if (state.left[from]) state.left[to] = state.left[from]; else delete state.left[to];
  }
  delete state.plan[key]; delete state.left[key];
  note(`moved ${soft(name)} ${at === 0 ? 'to tomorrow' : 'a day later'}`);
  save(); closeSheet(); render();
  toast(end - at > 1 ? `Moved. ${end - at} dinners slid back a day.` : at === 0 ? 'Moved to tomorrow' : 'Moved a day later', undo);
}
const shortDate = key => new Date(key + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const prepMissing = p => (p.kind ? missing(p).length : p.ings.filter(([id]) => !p.pack.includes(id) && !state.have[id]).length);
const actRow = a => `<li><span><b>${a.w ? (a.w === who ? 'You' : esc(a.w)) : 'Someone'}</b> ${esc(actText(a))}</span><small>${ago(a.t)}</small></li>`;
function dayRow(d) {
  const v = state.plan[d.key], p = recipe(v);
  if (SPECIAL[v]) return `<li class="dayrow"><button class="day" ${v === '@leftovers' && !leftName(d.key) ? `data-leftrow="${d.key}"` : `data-pick="${d.key}"`} aria-label="${dayName(d)}: ${SPECIAL[v]}. ${esc(specialNote(v, d.key))}.">
    <span class="dn">${dayShort(d)}</span><span class="thumb">${BOX}</span><span class="meal">${SPECIAL[v]}<small>${esc(specialNote(v, d.key))}</small></span></button>
    <button class="swap" data-pick="${d.key}" aria-label="Change dinner for ${dayName(d)}">Change</button></li>`;
  return p
    ? `<li class="dayrow"><button class="day" data-open="${p.id}" aria-label="${dayName(d)}: ${esc(p.name)}. Open the recipe.">
        <span class="dn">${dayShort(d)}</span><span class="thumb">${pic(p)}</span>
        <span class="meal">${esc(p.name)}<small>${packOn(p, d.key) ? 'freezer pack, ' : ''}${missingOn(p, d.key).length ? missingOn(p, d.key).length + ' to buy' : 'ready to cook'}</small></span></button>
        <button class="swap" data-pick="${d.key}" aria-label="Change dinner for ${dayName(d)}">Change</button></li>`
    : `<li><button class="day" data-pick="${d.key}" aria-label="${dayName(d)}: add a meal"><span class="dn">${dayShort(d)}</span><span class="thumb empty"></span><span class="meal none">Add a meal</span></button></li>`;
}

const FILTERS = [['all', 'All'], ['rotation', 'On rotation'], ['ranked', 'Top rated'], ['kid', `${KID} eats it`], ['pack', 'Freezer packs'], ['quick', 'Least prep'], ['allday', 'All day, 8+ hrs'], ['ready', 'Have everything'], ['protein', 'Most protein'], ['few', 'Fewest things']];
const starText = n => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';

function recipeRow(r, attr, rank) {
  const m = missing(r).length;
  const tags = [state.rot[r.id] ? 'On rotation' : '', starText(state.rate[r.id]), state.kid[r.id] === 'yes' ? `${KID} eats it` : '', state.packs[r.id] ? 'Pack in the freezer' : '', madeText(r.id), r.mine ? 'Yours' : ''].filter(Boolean);
  return `<li><button class="card" ${attr}>
    <span class="thumb">${pic(r)}</span>
    <span class="txt"><span class="name">${rank ? rank + '. ' : ''}${esc(r.name)}</span>
      ${tags.length ? `<span class="tags">${tags.map(t => `<i>${t}</i>`).join('')}</span>` : ''}
      <span class="meta">${r.kind ? `${esc(r.method)}. Makes ${esc(r.makes)}` : `${r.prep ? r.prep + ' min prep, ' : ''}${r.hours} hrs on low, ${r.protein} g protein`}</span>
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
  const more = canWrite ? `${waiting ? `<button class="btn wide ideas" data-back-ideas>See the ${waiting} new ${waiting === 1 ? 'recipe' : 'recipes'} again</button>` : ''}<button class="btn line wide ideas" data-ideas="${shelfKind}">Give me new ideas</button><button class="btn line wide" data-own>Add a recipe of my own</button>` : '';
  if (shelfKind !== 'dinner') {
    const list = RECIPES.filter(r => r.kind === shelfKind && !r.idea).sort(loved);
    return `${shelves}
    <p class="note">Make a batch on the weekend and keep it in the fridge or freezer. Nothing here has added sugar.</p>
    <ul class="cards">${list.map(r => recipeRow(r, `data-open="${r.id}"`)).join('')}</ul>${more}`;
  }
  let list = dinners(), empty = 'Nothing is fully stocked yet. Photograph the fridge and pantry, or tick things off in Kitchen.';
  if (filter === 'rotation') { list = list.filter(r => state.rot[r.id]).sort(loved); empty = 'Nothing is on rotation yet. Open a meal you loved and tap Put on rotation.'; }
  if (filter === 'ranked') { list = list.filter(r => state.rate[r.id]).sort((a, b) => state.rate[b.id] - state.rate[a.id] || loved(a, b)); empty = 'No meals are rated yet. Open a meal and give it stars; the best ones rise to the top here.'; }
  if (filter === 'kid') { list = list.filter(r => state.kid[r.id] === 'yes').sort(loved); empty = `Nothing is marked yet. Open a meal and say whether ${KID} ate it.`; }
  if (filter === 'pack') list = list.filter(r => r.pack);
  if (filter === 'quick') list = list.filter(r => r.prep).sort((a, b) => a.prep - b.prep || a.ings.length - b.ings.length);
  if (filter === 'allday') list = list.filter(r => r.hours >= 8);
  if (filter === 'ready') list = list.filter(r => !missing(r).length);
  if (filter === 'protein') list.sort((a, b) => b.protein - a.protein);
  if (filter === 'few') list.sort((a, b) => a.ings.length - b.ings.length);
  return `${shelves}
  <div class="chips" role="group" aria-label="Filter dinners">
    ${FILTERS.map(([id, label]) => `<button class="chip" data-filter="${id}" aria-pressed="${filter === id}">${label}</button>`).join('')}
  </div>
  ${filter === 'rotation' && list.length ? `<button class="btn wide spin" data-spin="next">Surprise me from the rotation</button>` : ''}
  ${filter === 'pack' ? `<p class="note">These can be bagged up raw and frozen, then tipped into the pot on a busy day. Open one for how.</p>` : ''}
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
  const spanSeg = `<div class="seg" role="group" aria-label="How far ahead to shop"><button data-span="7" aria-pressed="${span === 7}">This week</button><button data-span="14" aria-pressed="${span === 14}">Two weeks</button></div>`;
  const mine = `${state.todo.length ? `<h2 class="shelf">Also on the list</h2><ul class="also">${state.todo.map((t, n) => `<li><button class="tick" data-todo="${n}" aria-label="Bought ${esc(t)}"></button><span>${esc(t)}</span></li>`).join('')}</ul>` : ''}
  <form class="add" id="addTodo"><label for="todo">Add anything else to the list</label>
    <div><input id="todo" autocomplete="off" enterkeyhint="done" maxlength="40" placeholder="Milk, diapers..."><button class="btn small">Add</button></div></form>`;
  if (!shop.items.length) return `${spanSeg}<p class="note">${Object.keys(state.plan).length || state.prep.length ? 'Nothing to buy for these meals. Everything is in the kitchen.' : 'Plan a few dinners on the Tonight screen and what you need shows up here, priced for Walmart and Ingles.'}</p>${mine}`;
  const cheaper = shop.w <= shop.i ? 'Walmart' : 'Ingles';
  const real = shop.items.filter(it => fromReceipt(it.id, 'i')).length, n = shop.items.length;
  const old = (Date.now() - new Date(PRICED_ON + 'T12:00:00')) / 864e5 > 21;
  const cart = shop.items.filter(it => WM[it.id]).map(it => { const w = WM[it.id]; return `${Array.isArray(w) ? w[0] : w}%7C${it.packs * (Array.isArray(w) && w[1] === 'each' ? w[2] : 1)}`; });
  return `${spanSeg}
  <div class="verdict">
    <p class="kicker">Cheaper this trip</p>
    <p class="pick">${cheaper}</p>
    <p>About ${money(Math.abs(shop.w - shop.i))} less for this list.</p>
    ${real * 2 < n ? `<p class="stock">Most of the Ingles prices here are still estimates.</p>` : ''}
    <dl><div><dt>Walmart</dt><dd>${money(shop.w)}</dd></div><div><dt>Ingles</dt><dd>${money(shop.i)}</dd></div></dl>
  </div>
  <button class="btn line wide" data-share-list>Send this list</button>
  ${cart.length ? `<a class="btn line wide" href="https://affil.walmart.com/cart/addToCart?items=${cart.join(',')}" target="_blank" rel="noopener">Put these in my Walmart cart</a>
  <p class="note">Opens Walmart with ${cart.length === n ? 'everything' : `${cart.length} of the ${n}`} in the cart, ready for pickup or delivery. Sign in there to keep it. Meat goes in as one package, so check the sizes.</p>` : ''}
  <p class="note">Walmart prices were checked ${PRICED} at the Eatonton store${old ? ', so some will have moved' : ''}. Ingles: ${real ? `${real} of the ${n} prices here are from your receipts and the rest are estimates` : 'the prices here are all estimates'}${gap ? ', set from what your Ingles receipts have shown so far' : ''}. Each photo of an Ingles receipt makes more of them real. A dot marks a price from your own receipt.</p>
  <table class="buy">
    <thead><tr><th scope="col">Tick off as you buy</th><th scope="col">Walmart</th><th scope="col">Ingles</th></tr></thead>
    <tbody>${shop.items.map((it, k) => {
      const c = cat(it.id), w = price(it.id, 'w') * it.packs, i = price(it.id, 'i') * it.packs;
      const head = k === 0 || cat(shop.items[k - 1].id).section !== c.section ? `<tr class="sec"><th colspan="3" scope="colgroup">${c.section}</th></tr>` : '';
      return `${head}<tr>
        <th scope="row"><button class="tick" data-bought="${it.id}" aria-label="Bought ${esc(c.name)}"></button>
          <span><span class="name">${esc(c.name)}${it.packs > 1 ? ` <b>x${Number(it.packs)}</b>` : ''}</span><span class="meta">${esc(c.buy)}</span></span></th>
        <td class="${w <= i ? 'win' : ''}">${money(w)}${fromReceipt(it.id, 'w') ? '<i aria-label="from your receipt"></i>' : ''}</td>
        <td class="${i < w ? 'win' : ''}">${money(i)}${fromReceipt(it.id, 'i') ? '<i aria-label="from your receipt"></i>' : ''}</td></tr>`; }).join('')}
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
// Keeps the screen from dimming while a recipe is open, so it can be read with messy hands.
let lock = null;
async function stayAwake(on) {
  try {
    if (on && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
    else if (!on && lock) { const l = lock; lock = null; await l.release(); }
  } catch { lock = null; }
}
function closeSheet() {
  if (busy) return;
  stayAwake(false);
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
  ${r.ings.some(([iid, amt]) => (iid === 'onion' && /dice|slice/.test(amt)) || (iid === 'garlic' && /mince/.test(amt))) ? '<p class="safe">Faster: ready-diced onion from the produce case and jarred minced garlic both work here. Half a teaspoon of jarred garlic is one clove.</p>' : ''}
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
  <p class="safe">Rotation is your list of keepers. Surprise me picks from it.</p>
  <div class="kidrow" role="group" aria-label="Did ${KID} eat it?"><span>Did ${KID} eat it?</span>
    <button class="flip" data-kid="yes" data-rid="${r.id}" aria-pressed="${state.kid[r.id] === 'yes'}">Yes</button>
    <button class="flip" data-kid="no" data-rid="${r.id}" aria-pressed="${state.kid[r.id] === 'no'}">Not really</button></div>`;
}
const ideaActs = r => r.own
  ? `<div class="acts two"><button class="btn" data-keep-idea="${r.id}">Keep this recipe</button><button class="btn line" data-own>Not right, start over</button></div>`
  : `<div class="acts two"><button class="btn" data-keep-idea="${r.id}">Keep this recipe</button><button class="btn line" data-back-ideas>Back to the ideas</button></div>`;
const heads = r => (r.note ? `<p class="little warn"><b>Heads up.</b> ${esc(r.note)}</p>` : '');
const unproven = r => `${r.own
  ? `<p class="safe">This is your own recipe, put into Simmer's format. Check it against the original the first time you make it.</p>`
  : r.mine || r.idea ? `<p class="safe">This one was written on request and has not been test-cooked. Check the times the first time you make it. Chicken and turkey are done at 165°F, ground meat at 160°F, pork and beef roasts at 145°F.</p>` : ''}`;
// Notes the family leaves on a recipe, and a way to send the recipe to someone.
const notesBlock = r => r.idea ? '' : `<form class="add notes" id="noteForm" data-rid="${r.id}"><label for="noteText">Notes for next time</label>
  <textarea id="noteText" rows="2" maxlength="300" placeholder="More garlic. Halve the salt.">${esc(state.notes[r.id] || '')}</textarea><button class="btn small">Save note</button></form>
  <button class="link" data-share-recipe="${r.id}">Send this recipe to someone</button>`;
const listOf = a => (a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : a[0] || '');
// How to make a dinner ahead as a freezer pack, for the dinners that freeze well raw.
function packBlock(r) {
  if (!r.pack || r.idea) return '';
  const out = listOf(r.pack.map(id => soft(CATALOG[id][0].split(',')[0]))), have = state.packs[r.id], on = state.prep.includes(r.id);
  return `<h3>Make it a freezer pack</h3>
  <p class="blurb">Put everything raw into a gallon freezer bag${out ? `, except the ${esc(out)}` : ''}. Press the air out, write the name and date on it, and freeze it flat. It keeps 3 months. Thaw it in the fridge for ${thawDays(r) > 1 ? 'two nights' : 'a full night'}, on a plate, and cook it only once it has thawed all the way${out ? `. Add the ${esc(out)} on the day` : ''}.</p>
  ${have ? `<p class="little"><b>One is in the freezer,</b> frozen ${shortDate(have)}. The shopping list only asks for what stays out of the bag.</p>` : ''}
  <div class="acts two"><button class="btn line" data-prep="${r.id}">${on ? 'Take off weekend prep' : 'Add to weekend prep'}</button><button class="btn line" data-froze="${r.id}">${have ? 'I froze another' : 'I froze a pack'}</button></div>`;
}
function frozeSheet(id) {
  const r = recipe(id);
  const used = r.ings.filter(([iid]) => !r.pack.includes(iid) && !cat(iid).staple && state.have[iid]);
  openSheet(`${closer}
  <h2 id="sheetTitle">One for the freezer</h2>
  <p class="blurb">${used.length ? 'Anything ticked here went into the bag and comes off the kitchen list.' : 'It goes on the Made and waiting list.'}</p>
  <ul class="found">${used.map(([iid]) => `<li><label><input type="checkbox" data-used="${iid}" ${['Meat', 'Produce', 'Cans and jars'].includes(cat(iid).section) ? 'checked' : ''}>
    <span>${esc(CATALOG[iid][0])}</span></label></li>`).join('')}</ul>
  <button class="btn wide" data-froze-done="${id}">Done</button>`);
}
const dropper = r => r.mine ? `<button class="link drop" data-drop="${r.id}">Remove this recipe</button>` : '';

function prepSheet(r) {
  const on = state.prep.includes(r.id), made = state.stash[r.id];
  openSheet(`${closer}
  <div class="art">${pic(r)}</div>
  <h2 id="sheetTitle">${esc(r.name)}</h2>
  <p class="facts">${esc(r.method)}. Makes ${esc(r.makes)}.${r.prep ? ` About ${r.prep} minutes hands-on.` : ''}${madeText(r.id) ? ' ' + madeText(r.id) + '.' : ''}</p>
  ${r.idea || !API ? '' : `<div class="shots"><button class="link" data-shot="${r.id}">${state.photos[r.id] ? 'Retake my photo' : 'Use my own photo'}</button>${state.photos[r.id] ? `<button class="link" data-unshot="${r.id}">Go back to the drawing</button>` : ''}</div>`}
  <p class="blurb">${esc(r.blurb)}</p>${heads(r)}
  ${r.idea ? ideaActs(r) : `<div class="acts two">
    <button class="btn ${on ? 'line' : ''}" data-prep="${r.id}">${on ? 'Take off weekend prep' : 'Add to weekend prep'}</button>
    <button class="btn line" data-made="${r.id}">${made ? 'Made another batch' : 'I made a batch'}</button>
  </div>${lovedRow(r)}`}
  ${ingList(r)}
  <p class="little"><b>Keeping it.</b> ${esc(r.keeps)} Cool completely before it goes in a bag or box.</p>
  <p class="little"><b>For ${KID}.</b> ${esc(r.little)}</p>
  ${unproven(r)}${notesBlock(r)}${dropper(r)}`);
  stayAwake(true);
}

function recipeSheet(id) {
  const r = recipe(id);
  if (!r) return closeSheet();
  if (r.kind) return prepSheet(r);
  openSheet(`${closer}
  <div class="art">${pic(r)}</div>
  <h2 id="sheetTitle">${esc(r.name)}</h2>
  <p class="facts">${r.prep ? `${r.prep} minutes of prep. ` : ''}${r.hours} hours on low. Serves ${r.serves}. About ${r.protein} g protein a serving.${madeText(r.id) ? ' ' + madeText(r.id) + '.' : ''}</p>
  ${r.idea || !API ? '' : `<div class="shots"><button class="link" data-shot="${r.id}">${state.photos[r.id] ? 'Retake my photo' : 'Use my own photo'}</button>${state.photos[r.id] ? `<button class="link" data-unshot="${r.id}">Go back to the drawing</button>` : ''}</div>`}
  <p class="blurb">${esc(r.blurb)}</p>${heads(r)}
  ${r.idea ? ideaActs(r) : `${lovedRow(r)}
  <h3>Cook it on</h3>
  <div class="chips wrap">${days(14).map(d => `${d.i === 7 ? '</div><p class="safe">Or next week</p><div class="chips wrap">' : ''}<button class="chip" data-plan="${d.key}" data-id="${r.id}" aria-pressed="${state.plan[d.key] === r.id}">${d.i < 2 ? dayName(d) : dayShort(d)}${state.plan[d.key] && state.plan[d.key] !== r.id ? '<small> taken</small>' : ''}</button>`).join('')}</div>`}
  ${ingList(r)}
  <p class="little"><b>For ${KID}.</b> ${esc(r.little)} Salt the grown-up plates at the table.</p>
  <p class="safe">Thaw meat before it goes in. ${r.hours >= 8 ? 'Most slow cookers switch to warm on their own, so a long work day is fine.' : 'If you will be out longer than this, set it to switch to warm.'}</p>
  ${packBlock(r)}
  ${unproven(r)}${notesBlock(r)}${dropper(r)}`);
  stayAwake(true);
}

function pickSheet(key) {
  const d = days().find(x => x.key === key);
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
    ${cur ? `<button class="btn line" data-plan="${key}" data-id="">Clear this night</button><button class="btn line" data-slide="${key}">Move a day later</button>` : ''}
  </div>
  ${rot.length ? `<h3>On rotation</h3>
  <button class="btn wide spin" data-spin="${key}">Surprise me from the rotation</button>
  <ul class="cards tight">${rot.map(row).join('')}</ul>
  <h3>Everything else</h3>` : `<p class="blurb">Fewest things to buy first.</p>`}
  <ul class="cards tight">${rest.map(row).join('')}</ul>`);
}

// Choosing Leftovers asks which meal they are from, listing this week's dinners and the most recent ones first.
function leftSheet(key) {
  const d = days().find(x => x.key === key);
  if (!d) return closeSheet(); // the day rolled over while this was open
  const recent = [...new Set([...days().filter(x => x.i < d.i).reverse().map(x => state.plan[x.key]), ...[...state.log].reverse().map(l => l.id)])]
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
  const base = { id: 'm_' + slug(x.name) + '_' + Math.random().toString(36).slice(2, 6), name: x.name, blurb: x.blurb, ings, steps: x.steps, little: x.little, look: x.look,
    ...(Number.isFinite(x.prep) ? { prep: x.prep } : {}), ...(x.own ? { own: true } : {}), ...(x.note ? { note: String(x.note).slice(0, 200) } : {}) };
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
  if (list.every(r => r.own)) return recipeSheet(list[0].id);
  openSheet(`${closer}
  <h2 id="sheetTitle">${list.length === 1 ? 'One new idea' : list.length + ' new ideas'}</h2>
  <p class="blurb">Written just now and not test-cooked. Open one to read it, and keep the ones you like.</p>
  <ul class="cards tight">${list.map(r => recipeRow(r, `data-open="${r.id}"`)).join('')}</ul>
  <button class="btn line wide" data-ideas="${ideasKind}">Try three more</button>`);
}
// The family's own recipe, from a photo of the card or page, or pasted in.
let ownMode = false;
function ownSheet(msg = '') {
  openSheet(`${closer}<h2 id="sheetTitle">Add a recipe of your own</h2>
    <p class="blurb">A slow cooker dinner, or a breakfast or snack for ${KID}. Simmer puts it in the same shape as the others without changing how it is cooked.</p>
    ${msg ? `<p class="little warn">${esc(msg)}</p>` : ''}
    <button class="btn wide" data-own-photo>Photograph the card or page</button>
    <form class="add notes" id="ownForm"><label for="ownText">Or paste or type it here</label>
      <textarea id="ownText" rows="6" maxlength="6000"></textarea><button class="btn small">Read it</button></form>`);
}
async function readOwn(payload) {
  busy = true;
  openSheet(`<h2 id="sheetTitle">Reading your recipe</h2><p class="blurb">About 15 seconds.</p><div class="working" aria-hidden="true"></div>`);
  try {
    if (!state.base) await push();
    const res = await fetch(API + '/recipe', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ house: state.house, ...payload, catalog: Object.keys(CATALOG).map(id => ({ id, name: CATALOG[id][0] })),
        looks: RECIPES.filter(r => !r.idea && LOOKS.includes(r.id)).map(r => ({ id: r.id, name: r.name })) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.recipes) || !data.recipes.length) throw new Error(data.error || 'That could not be read. Try again.');
    ideas = data.recipes.map(x => fromIdea({ ...x, own: true }, ['breakfast', 'snack'].includes(x.kind) ? x.kind : 'dinner')).filter(i => i.recipe.ings.length >= 2);
    if (!ideas.length) throw new Error('That did not read as a recipe. Check the photo shows the ingredients and the steps.');
    hydrate(); busy = false;
    recipeSheet(ideas[0].recipe.id);
  } catch (e) {
    busy = false;
    ownSheet(e.message && !/fetch/i.test(e.message) ? e.message : 'Check the connection and try again.');
  }
}
function keepIdea(id) {
  const n = ideas.findIndex(i => i.recipe.id === id);
  if (n < 0) return;
  const [it] = ideas.splice(n, 1);
  note(`${it.recipe.own ? 'added a family recipe' : 'kept a new recipe'}: ${it.recipe.name}`);
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
  delete state.rot[id]; delete state.rate[id]; delete state.kid[id]; delete state.notes[id];
  tidy(); save(); closeSheet(); render();
  toast('Recipe removed');
}

// Plans a random rotation dinner for a night, skipping ones already on this week when it can.
function spin(key) {
  const all = days();
  if (key === 'next') { const open = all.slice(0, 7).find(d => !state.plan[d.key] && !(d.i === 0 && (cookingNow() || (dinnerAt() - Date.now()) / 36e5 < 4))); if (!open) return toast('Every night already has a plan'); key = open.key; }
  if (!all.some(d => d.key === key)) { closeSheet(); return; }
  if (key === today() && cookingNow()) return toast('Tonight\'s dinner is already in the pot');
  const planned = new Set(Object.values(state.plan));
  let pool = onRotation().filter(r => r.id !== state.plan[key]);
  if (pool.some(r => daysSince(r.id) > 14)) pool = pool.filter(r => daysSince(r.id) > 14);
  if (pool.some(r => !planned.has(r.id))) pool = pool.filter(r => !planned.has(r.id));
  if (!pool.length) return toast('Nothing else is on rotation yet');
  const r = pool[Math.floor(Math.random() * pool.length)];
  state.plan[key] = r.id;
  if (key === today() && state.cooking && state.cooking.id !== r.id) state.cooking = null;
  const d = all.find(x => x.key === key);
  note(`planned ${r.name} for ${d.i === 0 ? 'tonight' : d.i === 1 ? 'tomorrow' : dayName(d)}`);
  save(); closeSheet(); render();
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
async function morningSheet(msg = '') {
  const sub = await pushState().catch(() => null);
  notePush(!!sub);
  openSheet(`${closer}<h2 id="sheetTitle">Alerts</h2>
    <p class="blurb">Notifications from Simmer on this phone. Each phone turns them on for itself. What gets sent is the same for the whole kitchen.</p>
    ${msg ? `<p class="little">${esc(msg)}</p>` : ''}
    ${!canPush() ? `<p class="little">This only works when Simmer is opened from its home screen icon (iPhone needs iOS 16.4 or newer). Add it to the home screen, open it from there, and come back to this screen.</p>`
      : sub ? `<p class="little"><b>On for this phone.</b></p>
        <button class="btn wide" data-push-test>Send a test now</button><button class="btn line wide" data-push-off>Turn off on this phone</button>`
      : `<button class="btn wide" data-push-on>Turn on for this phone</button>`}
    <h3>What to send</h3>
    <ul class="switches">${ALERTS.map(([k, name, what]) => `<li><span>${name}<small>${what}</small></span>
      <button class="flip" data-alert="${k}" aria-pressed="${alertOn(k)}" aria-label="${name}: ${alertOn(k) ? 'on' : 'off'}">${alertOn(k) ? 'on' : 'off'}</button></li>`).join('')}</ul>
    <label class="time">Send the morning plan at <input type="time" id="briefTime" value="${esc(state.brief || '07:00')}"></label>`);
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
    warm();
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
  const detail = Array.isArray(res.detail) ? res.detail : [];
  const ok = (res.sent || []).some(c => c >= 200 && c < 300);
  morningSheet(ok ? 'Test sent. It should arrive within a few seconds. If it does not, check that notifications are allowed for Simmer in the phone\'s Settings and that a Focus is not holding it back.'
    : detail.length ? `The phone's notification service turned it down (${detail.map(x => `${x.status}${x.reason ? ' ' + x.reason : ''}`).join('; ').slice(0, 160)}). Turn alerts off and on again on this phone, then retry.`
    : (res.error || 'The test could not be sent. Turn it off and on again, then retry.'));
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
      if (pending.store && p > 0 && p < 200) state.prices[it.id] = { ...state.prices[it.id], [pending.store]: p, [pending.store + 't']: today() };
    } else {
      const name = String(it.name).trim().slice(0, 40);
      if (name && !state.extra.some(x => x.toLowerCase() === name.toLowerCase())) state.extra.push(name);
    }
    n++;
  });
  if (n) note(`added ${n} ${n === 1 ? 'thing' : 'things'} from a ${pending.store ? 'receipt' : 'photo'}`);
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
  if (d.who) { setWho(d.who); return render(); }
  if ('whoAsk' in d) {
    return openSheet(`${closer}<h2 id="sheetTitle">Whose phone is this?</h2>
      <p class="blurb">Simmer uses the name to say who changed what. It stays on this phone.</p>
      <form class="add" id="whoForm"><label for="whoName">Name</label>
        <div><input id="whoName" autocomplete="given-name" maxlength="20" value="${esc(who)}"><button class="btn small">Save</button></div></form>`);
  }
  if ('nextWeek' in d) { showNext = !showNext; return render(); }
  if (d.hint) { try { localStorage.setItem('simmer.hint.' + d.hint, '1'); } catch { /* shows again next time */ } return render(); }
  if (d.slide) return slide(d.slide);
  if (d.startBack) {
    // It went on earlier and nobody tapped: count it as started in time to be ready at dinner.
    const r = recipe(d.startBack), bag = packOf(r), midnight = new Date(); midnight.setHours(0, 0, 0, 0);
    for (const [iid] of r.ings) if (!bag || bag.includes(iid)) state.have[iid] = true;
    delete state.packs[r.id];
    state.plan[today()] = r.id; state.cooking = { id: r.id, start: Math.max(midnight.getTime(), Math.min(Date.now(), dinnerAt() - r.hours * 36e5)) };
    note(`said the ${soft(r.name)} is in the pot`);
    save(); render(); return toast('Timer set to be ready at dinner time');
  }
  if ('gotoPacks' in d) { tab = 'recipes'; shelfKind = 'dinner'; filter = 'pack'; render(); window.scrollTo(0, 0); return; }
  if (d.span) { span = d.span === '14' ? 14 : 7; try { localStorage.setItem('simmer.span', String(span)); } catch { /* no storage */ } return render(); }
  if ('acts' in d) return openSheet(`${closer}<h2 id="sheetTitle">Lately</h2><ul class="lately">${[...state.acts].reverse().map(actRow).join('')}</ul>`);
  if (d.alert) {
    state.alerts[d.alert] = !alertOn(d.alert);
    save();
    const on = alertOn(d.alert);
    b.setAttribute('aria-pressed', on); b.textContent = on ? 'on' : 'off';
    return;
  }
  if (d.kid) {
    if (state.kid[d.rid] === d.kid) delete state.kid[d.rid]; else state.kid[d.rid] = d.kid;
    if (state.kid[d.rid]) note(`said ${KID} ${state.kid[d.rid] === 'yes' ? 'ate' : 'did not go for'} the ${soft(recipe(d.rid).name)}`, 'kid:' + d.rid);
    save();
    b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', state.kid[d.rid] === x.dataset.kid));
    return render();
  }
  if (d.froze) return frozeSheet(d.froze);
  if (d.frozeDone) {
    document.querySelectorAll('[data-used]:checked').forEach(box => { delete state.have[box.dataset.used]; });
    state.packs[d.frozeDone] = today();
    state.prep = state.prep.filter(x => x !== d.frozeDone);
    note(`froze a pack of ${soft(recipe(d.frozeDone).name)}`);
    save(); closeSheet(); render();
    return toast('On the Made and waiting list');
  }
  if (d.unpack) { const undo = snap(); delete state.packs[d.unpack]; save(); render(); return toast('Freezer pack used', undo); }
  if (d.shareRecipe) {
    const r = recipe(d.shareRecipe);
    return send({ text: `${r.name}\n${r.kind ? `${r.method}. Makes ${r.makes}.` : `Slow cooker, ${r.hours} hours on low. Serves ${r.serves}.`}\n\nWhat goes in:\n${r.ings.map(([iid, amt]) => `- ${CATALOG[iid][0]}: ${amt}`).join('\n')}\n\nHow:\n${r.steps.map((t, n) => `${n + 1}. ${t}`).join('\n')}${state.notes[r.id] ? `\n\nOur notes: ${state.notes[r.id]}` : ''}` }, 'Recipe copied');
  }
  if ('own' in d) return ownSheet();
  if ('ownPhoto' in d) { ownMode = true; shotFor = ''; $('#photo').setAttribute('multiple', ''); $('#photo').value = ''; $('#photo').click(); return; }
  if (d.rot) {
    if (state.rot[d.rot]) delete state.rot[d.rot]; else state.rot[d.rot] = true;
    note(`${state.rot[d.rot] ? 'put' : 'took'} ${soft(recipe(d.rot).name)} ${state.rot[d.rot] ? 'on' : 'off'} rotation`, 'rot:' + d.rot);
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
    if (state.rate[d.rid]) note(`gave the ${soft(recipe(d.rid).name)} ${n} ${n === 1 ? 'star' : 'stars'}`, 'rate:' + d.rid);
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
    if (!on) note(`added ${soft(recipe(d.prep).name)} to weekend prep`);
    save(); closeSheet(); render();
    return toast(on ? 'Taken off weekend prep' : 'Added to weekend prep');
  }
  if (d.made) {
    state.stash[d.made] = today();
    state.prep = state.prep.filter(x => x !== d.made);
    note(`made a batch of ${soft(recipe(d.made).name)}`);
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
    const day = days().find(x => x.key === d.plan), on = day ? (day.i === 0 ? 'tonight' : day.i === 1 ? 'tomorrow' : dayName(day)) : 'a night';
    note(state.plan[d.plan] ? `planned ${SPECIAL[d.id] ? SPECIAL[d.id].toLowerCase() : recipe(d.id).name} for ${on}` : `cleared dinner for ${on}`, 'plan:' + d.plan);
    if (d.id === '@leftovers' && state.plan[d.plan] === '@leftovers') { save(); return leftSheet(d.plan); }
    delete state.left[d.plan];
    save();
    if (b.classList.contains('chip')) {
      b.setAttribute('aria-pressed', state.plan[d.plan] === d.id); render();
      const old = SPECIAL[was] || recipe(was)?.name;
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
  if (d.tonight) { state.plan[today()] = d.tonight; note(`planned ${recipe(d.tonight).name} for tonight`, 'plan:' + today()); save(); render(); return toast('Planned for tonight'); }
  if (d.start) {
    const r = recipe(d.start), bag = packOf(r); // with a freezer pack, only what stayed out of the bag came from the kitchen
    for (const [iid] of r.ings) if (!bag || bag.includes(iid)) state.have[iid] = true;
    delete state.packs[d.start];
    state.plan[today()] = d.start; state.cooking = { id: d.start, start: Date.now() };
    note(`put the ${soft(r.name)} in the pot`);
    save(); render(); return toast('Timer started');
  }
  if (d.served) return servedSheet(d.served);
  if (d.clear) {
    document.querySelectorAll('[data-used]:checked').forEach(box => { delete state.have[box.dataset.used]; });
    note(`served the ${soft(recipe(d.clear).name)}`);
    const potDay = state.cooking && Number.isFinite(state.cooking.start) ? dayKey(new Date(state.cooking.start)) : today();
    state.last = { id: d.clear, day: potDay };
    state.log = [...state.log, { id: d.clear, day: potDay }].slice(-300);
    state.cooking = null; if (state.plan[potDay] === d.clear) delete state.plan[potDay];
    save(); closeSheet(); render(); return;
  }
  if (d.have) {
    if (state.have[d.have]) delete state.have[d.have]; else state.have[d.have] = true;
    note('updated # in the kitchen', 'have');
    save(); b.setAttribute('aria-pressed', !!state.have[d.have]);
    const n = shopping().items.length; $('#listCount').hidden = !n; $('#listCount').textContent = n;
    return;
  }
  if (d.ing) {
    if (state.have[d.ing]) delete state.have[d.ing]; else state.have[d.ing] = true;
    delete state.low[d.ing];
    note('updated # in the kitchen', 'have');
    save();
    const top = $('#sheet').scrollTop;
    recipeSheet(d.rid); $('#sheet').scrollTop = top;
    $(`#sheet [data-ing="${d.ing}"]`)?.focus({ preventScroll: true });
    return render();
  }
  if (d.extra) { const undo = snap(); const [gone] = state.extra.splice(+d.extra, 1); save(); render(); return toast(`${gone} removed`, undo); }
  if (d.bought) { const undo = snap(); state.have[d.bought] = true; delete state.low[d.bought]; note('ticked # off the shopping list', 'bought'); save(); render(); return toast('Bought', undo); }
  if (d.todo) { const undo = snap(); state.todo.splice(+d.todo, 1); note('ticked # off the shopping list', 'bought'); save(); render(); return toast('Bought', undo); }
  if (d.staple) {
    const id = d.staple;
    if (state.low[id]) { delete state.low[id]; delete state.have[id]; }      // low -> out
    else if (state.have[id]) state.low[id] = true;                            // have -> running low
    else state.have[id] = true;                                               // out -> have
    note('updated # in the kitchen', 'have');
    save(); return render();
  }
  if ('autoplan' in d) return d.autoplan === 'next' ? autoplan(7, 14) : autoplan();
  if (d.shot) { ownMode = false; shotFor = d.shot; $('#photo').removeAttribute('multiple'); $('#photo').value = ''; $('#photo').click(); return; }
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
    ownMode = false; shotFor = ''; $('#photo').setAttribute('multiple', '');
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
    if (/^\d\d:\d\d$/.test(v)) { state.dinner = v; note(`set dinner time to ${clock(dinnerAt())}`, 'dinner'); save(); }
    closeSheet(); render(); return toast('Dinner time saved');
  }
});

$('#photo').addEventListener('change', async e => {
  if (!e.target.files.length) return;
  if (shotFor) return saveShot(shotFor, e.target.files[0]);
  if (ownMode) {
    ownMode = false;
    try { return readOwn({ images: await Promise.all([...e.target.files].slice(0, 3).map(f => shrink(f, 1600))) }); }
    catch { return ownSheet('That photo could not be opened. Try again, or paste the recipe in.'); }
  }
  readPhotos(e.target.files);
});
function setWho(name) {
  who = String(name).replace(/[<>]/g, '').trim().slice(0, 20);
  try { localStorage.setItem('simmer.who', who); } catch { /* still works for this visit */ }
}

document.addEventListener('submit', e => {
  if (e.target.id === 'whoForm') {
    e.preventDefault();
    setWho($('#whoName').value);
    closeSheet(); render();
    return toast(who ? `This phone is ${who}'s` : 'Name cleared');
  }
  if (e.target.id === 'noteForm') {
    e.preventDefault();
    const id = e.target.dataset.rid, t = $('#noteText').value.trim().slice(0, 300);
    if (t) state.notes[id] = t; else delete state.notes[id];
    if (t) note(`left a note on the ${soft(recipe(id).name)}`, 'note:' + id);
    save();
    return toast(t ? 'Note saved' : 'Note cleared');
  }
  if (e.target.id === 'ownForm') {
    e.preventDefault();
    const text = $('#ownText').value.trim();
    if (text.length < 20) return toast('Paste the whole recipe: what goes in and how it is made');
    return readOwn({ text });
  }
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
    if (t && !state.todo.some(x => x.toLowerCase() === t.toLowerCase())) { state.todo.push(t); note(`added ${t} to the shopping list`); }
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
  if ($('#sheet').hidden) render(); else if ($('#sheet .steps')) stayAwake(true);
});
window.addEventListener('online', () => pull()); // back in signal: send what was changed and fetch what the other phone did
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
// The background helper keeps a copy of the app on the phone so it opens with no signal, and shows the alerts.
async function warm() {
  try {
    if (!('serviceWorker' in navigator)) return;
    await navigator.serviceWorker.register(swUrl());
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ warm: V });
  } catch { /* private browsing and some browsers have no helper; the app still works online */ }
}
warm().then(() => resub());

document.addEventListener('change', e => {
  if (e.target.id === 'briefTime' && /^\d\d:\d\d$/.test(e.target.value)) { state.brief = e.target.value; save(); stale = true; toast('Reminder time saved'); }
});
// Search box on the recipe shelves: hides cards that do not match, without redrawing.
document.addEventListener('input', e => {
  if (e.target.id !== 'find') return;
  const q = e.target.value.trim().toLowerCase();
  document.querySelectorAll('#view .cards > li').forEach(li => { li.hidden = !!q && !li.querySelector('.name').textContent.toLowerCase().includes(q); });
});
