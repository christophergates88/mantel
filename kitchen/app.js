// Simmer: a slow cooker kitchen for one household. Kept on the phone, and shared between the family's phones.
import { CATALOG, RECIPES, SECTIONS } from './data.js';
import { READER_URL } from './config.js';
import { dish } from './art.js';

const KEY = 'simmer.v2';
const API = READER_URL.replace(/\/$/, '');
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + n.toFixed(2);
const cat = id => { const c = CATALOG[id]; return { id, name: c[0], section: c[1], w: c[2], i: c[3], buy: c[4], staple: !!c[5] }; };
const recipe = id => RECIPES.find(r => r.id === id);
const DINNERS = RECIPES.filter(r => !r.kind);
const KID = 'Cason';

// ---------------------------------------------------------------- dates and times

const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => dayKey(new Date());
function week() {
  const out = [];
  for (let i = 0; i < 7; i++) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + i); out.push({ key: dayKey(d), date: d, i }); }
  return out;
}
const dayName = d => d.i === 0 ? 'Tonight' : d.i === 1 ? 'Tomorrow' : d.date.toLocaleDateString('en-US', { weekday: 'long' });
const clock = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
function dinnerAt() {
  const [h, m] = (state.dinner || '17:30').split(':').map(Number);
  const d = new Date(); d.setHours(h, m, 0, 0); return d;
}

// ---------------------------------------------------------------- state

const SHARED = ['have', 'extra', 'plan', 'prep', 'stash', 'prices', 'dinner', 'cooking', 'updatedAt'];
function newCode() {
  const a = new Uint8Array(20); crypto.getRandomValues(a);
  return [...a].map(n => 'abcdefghjkmnpqrstuvwxyz23456789'[n % 31]).join('');
}
function fresh() {
  const have = {};
  for (const id in CATALOG) if (CATALOG[id][5]) have[id] = true; // the spice shelf starts stocked
  return { have, extra: [], plan: {}, prep: [], stash: {}, prices: {}, dinner: '17:30', cooking: null, house: newCode(), updatedAt: 0 };
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
function tidy() {
  for (const k of Object.keys(state.plan || {})) if (k < today() || !recipe(state.plan[k]) || recipe(state.plan[k]).kind) delete state.plan[k];
  state.prep = (state.prep || []).filter(id => recipe(id)?.kind);
  state.stash = state.stash || {};
  for (const id of Object.keys(state.stash)) if (!recipe(id)) delete state.stash[id];
}
tidy();

const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* still works for this visit */ } };
let pushTimer;
function save() {
  state.updatedAt = Date.now();
  keep();
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, 700);
}

// ---------------------------------------------------------------- sharing between phones

const shared = () => Object.fromEntries(SHARED.map(k => [k, state[k]]));
function adopt(doc) {
  for (const k of SHARED) if (k in doc) state[k] = doc[k];
  tidy();
  keep();
  if ($('#sheet').hidden) render();
}
async function push() {
  if (!API) return;
  try {
    const r = await fetch(`${API}/house/${state.house}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(shared()) });
    const d = await r.json();
    if (d && d.newer) adopt(d.newer);
  } catch { /* offline: this phone keeps its copy and tries again on the next change */ }
}
async function pull() {
  if (!API) return;
  try {
    const doc = await (await fetch(`${API}/house/${state.house}`)).json();
    if (doc && doc.updatedAt > (state.updatedAt || 0)) adopt(doc);
    else if (!doc && state.updatedAt) push();
  } catch { /* offline */ }
}
const joined = location.hash.match(/house=([a-z0-9]{16,32})/);
if (joined && joined[1] !== state.house) { state.house = joined[1]; state.updatedAt = 0; keep(); }
if (joined) history.replaceState(null, '', location.pathname);

let tab = 'home';
let filter = 'all';

// ---------------------------------------------------------------- sums

const price = (id, store) => state.prices[id]?.[store] ?? cat(id)[store];
const fromReceipt = (id, store) => state.prices[id]?.[store] != null;
const missing = r => r.ings.filter(([id]) => !state.have[id]);
const haveCount = r => r.ings.length - missing(r).length;
const cookingNow = () => state.cooking && recipe(state.cooking.id) ? state.cooking : null;

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
    for (const [iid, , packs = 1] of recipe(id).ings) {
      if (state.have[iid] || need.has(iid)) continue; // one package covers the weekend baking
      need.set(iid, { id: iid, packs });
    }
  }
  const items = [...need.values()].sort((a, b) => SECTIONS.indexOf(cat(a.id).section) - SECTIONS.indexOf(cat(b.id).section));
  const total = store => items.reduce((sum, it) => sum + price(it.id, store) * it.packs, 0);
  return { items, w: total('w'), i: total('i') };
}

// The best thing to cook tonight when nothing is planned: fewest things to buy, then done by dinner, then protein.
function suggestion() {
  const hoursLeft = (dinnerAt() - Date.now()) / 36e5;
  const late = r => (r.hours > hoursLeft + 0.25 ? 1 : 0);
  return [...DINNERS].sort((a, b) => missing(a).length - missing(b).length || late(a) - late(b) || b.protein - a.protein)[0];
}

function timing(r) {
  const dinner = dinnerAt();
  const startBy = new Date(dinner - r.hours * 36e5);
  if (Date.now() <= startBy) return `Put it on by ${clock(startBy)} to eat at ${clock(dinner)}.`;
  return `Put it on now and it is ready about ${clock(new Date(Date.now() + r.hours * 36e5))}.`;
}

// ---------------------------------------------------------------- views

function homeView() {
  const cook = cookingNow();
  const planned = recipe(state.plan[today()]);
  const r = cook ? recipe(cook.id) : planned || suggestion();
  const miss = missing(r).length;
  let body;
  if (cook) {
    const start = new Date(cook.start), done = new Date(cook.start + r.hours * 36e5);
    const pct = Math.max(3, Math.min(100, Math.round((Date.now() - cook.start) / (r.hours * 36e5) * 100)));
    body = `<p class="kicker">In the pot</p><h2>${esc(r.name)}</h2>
      <p class="when">${Date.now() >= done ? `Ready since ${clock(done)}. It is holding on warm.` : `On since ${clock(start)}. Ready about ${clock(done)}.`}</p>
      <svg class="bar" viewBox="0 0 100 3" preserveAspectRatio="none" role="img" aria-label="${pct} percent of the way there"><rect class="track" width="100" height="3"/><rect class="fill" width="${pct}" height="3"/></svg>
      <div class="acts"><button class="btn brass" data-served="${r.id}">Dinner is served</button><button class="btn ghost" data-open="${r.id}">Recipe</button></div>`;
  } else if (planned) {
    body = `<p class="kicker">Tonight</p><h2>${esc(r.name)}</h2>
      <p class="when">${timing(r)}</p>
      <p class="stock">${miss ? `Still need ${miss} ${miss === 1 ? 'thing' : 'things'}.` : 'Everything is in the kitchen.'}</p>
      <div class="acts"><button class="btn brass" data-start="${r.id}">It is in the pot</button><button class="btn ghost" data-open="${r.id}">Recipe</button><button class="btn ghost" data-pick="${today()}">Change</button></div>`;
  } else {
    body = `<p class="kicker">Nothing planned tonight</p><h2>How about ${esc(r.name.charAt(0).toLowerCase() + r.name.slice(1))}?</h2>
      <p class="when">${timing(r)}</p>
      <p class="stock">${miss ? `You have ${haveCount(r)} of the ${r.ings.length} things it needs.` : 'Everything is in the kitchen.'}</p>
      <div class="acts"><button class="btn brass" data-tonight="${r.id}">Make this tonight</button><button class="btn ghost" data-pick="${today()}">Pick something else</button></div>`;
  }
  const shop = shopping();
  return `
  <section class="hero">${dish(r.id, r.name)}<div class="panel">${body}</div></section>

  <h2 class="shelf">The week</h2>
  <ul class="days">${week().map(d => {
    const p = recipe(state.plan[d.key]);
    return p
      ? `<li class="dayrow"><button class="day" data-open="${p.id}" aria-label="${dayName(d)}: ${esc(p.name)}. Open the recipe.">
          <span class="dn">${dayName(d)}</span><span class="thumb">${dish(p.id, p.name)}</span>
          <span class="meal">${esc(p.name)}<small>${missing(p).length ? missing(p).length + ' to buy' : 'ready to cook'}</small></span></button>
          <button class="swap" data-pick="${d.key}" aria-label="Change dinner for ${dayName(d)}">Change</button></li>`
      : `<li><button class="day" data-pick="${d.key}"><span class="dn">${dayName(d)}</span><span class="thumb empty"></span><span class="meal none">Add a meal</span></button></li>`; }).join('')}</ul>
  ${shop.items.length ? `<button class="btn wide" data-tab="list">${shop.items.length} ${shop.items.length === 1 ? 'thing' : 'things'} to buy, about ${money(Math.min(shop.w, shop.i))}</button>` : ''}

  <h2 class="shelf">Weekend prep for ${KID}</h2>
  ${state.prep.length ? `<ul class="days">${state.prep.map(recipe).map(p => `<li><button class="day prep" data-open="${p.id}">
      <span class="thumb">${dish(p.id, p.name)}</span><span class="meal">${esc(p.name)}<small>${esc(p.method)}${missing(p).length ? `, ${missing(p).length} to buy` : ', ready to make'}</small></span></button></li>`).join('')}</ul>`
    : `<p class="note">Pick a few breakfasts and snacks to batch on Saturday or Sunday. What they need goes on the shopping list.</p>`}
  <button class="btn line wide" data-goto="breakfast">Choose breakfasts and snacks</button>
  ${Object.keys(state.stash).length ? `<h2 class="shelf">Made and waiting</h2>
  <ul class="days">${Object.keys(state.stash).map(id => { const p = recipe(id); const made = new Date(state.stash[id] + 'T12:00:00');
    return `<li class="dayrow"><button class="day prep" data-open="${p.id}"><span class="thumb">${dish(p.id, p.name)}</span>
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
  </div>`;
}

const FILTERS = [['all', 'All'], ['allday', 'All day, 8+ hrs'], ['ready', 'Have everything'], ['protein', 'Most protein'], ['few', 'Fewest things']];

function recipeRow(r, attr) {
  const m = missing(r).length;
  return `<li><button class="card" ${attr}>
    <span class="thumb">${dish(r.id, r.name)}</span>
    <span class="txt"><span class="name">${esc(r.name)}</span>
      <span class="meta">${r.kind ? `${r.method}. Makes ${r.makes}` : `${r.hours} hrs on low, about ${r.protein} g protein`}</span>
      <span class="have ${m ? '' : 'ok'}">${m ? `You have ${haveCount(r)} of ${r.ings.length}` : 'You have everything'}</span></span>
  </button></li>`;
}

let shelfKind = 'dinner';
const SHELVES = [['dinner', 'Dinners'], ['breakfast', `${KID}'s breakfasts`], ['snack', `${KID}'s snacks`]];

function recipesView() {
  const shelves = `<div class="seg" role="group" aria-label="Kind of recipe">${SHELVES.map(([id, label]) =>
    `<button data-shelf="${id}" aria-pressed="${shelfKind === id}">${label}</button>`).join('')}</div>`;
  if (shelfKind !== 'dinner') {
    const list = RECIPES.filter(r => r.kind === shelfKind);
    return `${shelves}
    <p class="note">Make a batch on the weekend and keep it in the fridge or freezer. Nothing here has added sugar.</p>
    <ul class="cards">${list.map(r => recipeRow(r, `data-open="${r.id}"`)).join('')}</ul>`;
  }
  let list = [...DINNERS];
  if (filter === 'allday') list = list.filter(r => r.hours >= 8);
  if (filter === 'ready') list = list.filter(r => !missing(r).length);
  if (filter === 'protein') list.sort((a, b) => b.protein - a.protein);
  if (filter === 'few') list.sort((a, b) => a.ings.length - b.ings.length);
  return `${shelves}
  <div class="chips" role="group" aria-label="Filter dinners">
    ${FILTERS.map(([id, label]) => `<button class="chip" data-filter="${id}" aria-pressed="${filter === id}">${label}</button>`).join('')}
  </div>
  ${list.length ? `<ul class="cards">${list.map(r => recipeRow(r, `data-open="${r.id}"`)).join('')}</ul>`
  : `<p class="note">Nothing is fully stocked yet. Photograph the fridge and pantry, or tick things off in Kitchen.</p>`}`;
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
    <div class="pills">${Object.keys(CATALOG).filter(id => CATALOG[id][1] === sec).map(id =>
      `<button class="pill" data-have="${id}" aria-pressed="${!!state.have[id]}">${esc(CATALOG[id][0])}</button>`).join('')}</div>`).join('')}
  <h2 class="shelf">Other things on hand</h2>
  ${state.extra.length ? `<div class="pills">${state.extra.map((n, i) =>
      `<button class="pill" data-extra="${i}" aria-pressed="true" aria-label="Remove ${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
  <form class="add" id="addExtra">
    <label for="extra">Add something else</label>
    <div><input id="extra" autocomplete="off" enterkeyhint="done" maxlength="40"><button class="btn small">Add</button></div>
  </form>`;
}

function listView() {
  const shop = shopping();
  if (!Object.keys(state.plan).length && !state.prep.length) return `<p class="note">Plan a few dinners on the Tonight screen and what you need shows up here, priced for Walmart and Ingles.</p>`;
  if (!shop.items.length) return `<p class="note">Nothing to buy. Everything for this week is in the kitchen.</p>`;
  const cheaper = shop.w <= shop.i ? 'Walmart' : 'Ingles';
  return `
  <div class="verdict">
    <p class="kicker">Cheaper this trip</p>
    <p class="pick">${cheaper}</p>
    <p>About ${money(Math.abs(shop.w - shop.i))} less for this list.</p>
    <dl><div><dt>Walmart</dt><dd>${money(shop.w)}</dd></div><div><dt>Ingles</dt><dd>${money(shop.i)}</dd></div></dl>
  </div>
  <button class="btn line wide" data-share-list>Send this list</button>
  <p class="note">Prices are estimates for Eatonton until a receipt replaces them. Ingles weekly meat specials can beat these.</p>
  <table class="buy">
    <thead><tr><th scope="col">Tick off as you buy</th><th scope="col">Walmart</th><th scope="col">Ingles</th></tr></thead>
    <tbody>${shop.items.map(it => {
      const c = cat(it.id), w = price(it.id, 'w') * it.packs, i = price(it.id, 'i') * it.packs;
      return `<tr>
        <th scope="row"><button class="tick" data-bought="${it.id}" aria-label="Bought ${esc(c.name)}"></button>
          <span><span class="name">${esc(c.name)}${it.packs > 1 ? ` <b>x${it.packs}</b>` : ''}</span><span class="meta">${esc(c.buy)}</span></span></th>
        <td class="${w <= i ? 'win' : ''}">${money(w)}${fromReceipt(it.id, 'w') ? '<i title="From your receipt">r</i>' : ''}</td>
        <td class="${i < w ? 'win' : ''}">${money(i)}${fromReceipt(it.id, 'i') ? '<i title="From your receipt">r</i>' : ''}</td></tr>`; }).join('')}
    </tbody>
  </table>`;
}

function render() {
  const views = { home: homeView, recipes: recipesView, kitchen: kitchenView, list: listView };
  $('#view').innerHTML = views[tab]();
  const subs = { home: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
                 recipes: `${DINNERS.length} suppers, ${RECIPES.length - DINNERS.length} breakfasts and snacks`, kitchen: 'What is in the house', list: 'What to buy, and where' };
  $('#sub').textContent = subs[tab];
  document.querySelectorAll('.tabs button').forEach(b => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const n = shopping().items.length;
  $('#listCount').hidden = !n;
  $('#listCount').textContent = n;
}

// ---------------------------------------------------------------- sheets

let lastFocus = null;
function openSheet(html) {
  if ($('#sheet').hidden) lastFocus = document.activeElement;
  $('#sheet').innerHTML = html;
  $('#sheet').hidden = false; $('#scrim').hidden = false;
  $('#sheet').scrollTop = 0;
  document.body.classList.add('locked');
  $('#sheet').querySelector('button, input')?.focus({ preventScroll: true });
}
function closeSheet() {
  $('#sheet').hidden = true; $('#scrim').hidden = true;
  document.body.classList.remove('locked');
  lastFocus?.focus?.({ preventScroll: true });
}
const closer = `<button class="close" data-close aria-label="Close">Close</button>`;

function ingList(r) {
  return `<h3>What goes in</h3>
  <ul class="ings">${r.ings.map(([iid, amt]) => `<li class="${state.have[iid] ? 'got' : 'need'}">
    <span>${esc(CATALOG[iid][0])}<small>${esc(amt)}</small></span>
    <button class="flip" data-ing="${iid}" data-rid="${r.id}" aria-label="${esc(CATALOG[iid][0])}: ${state.have[iid] ? 'have it. Tap if you do not' : 'need it. Tap if you have it'}">${state.have[iid] ? 'have' : 'need'}</button></li>`).join('')}</ul>
  <p class="safe">Tap have or need to correct it.</p>
  <h3>How</h3>
  <ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
}

function prepSheet(r) {
  const on = state.prep.includes(r.id), made = state.stash[r.id];
  openSheet(`${closer}
  <div class="art">${dish(r.id, r.name)}</div>
  <h2 id="sheetTitle">${esc(r.name)}</h2>
  <p class="facts">${esc(r.method)}. Makes ${esc(r.makes)}.</p>
  <p class="blurb">${esc(r.blurb)}</p>
  <div class="acts two">
    <button class="btn ${on ? 'line' : ''}" data-prep="${r.id}">${on ? 'Take off weekend prep' : 'Add to weekend prep'}</button>
    <button class="btn line" data-made="${r.id}">${made ? 'Made another batch' : 'I made a batch'}</button>
  </div>
  ${ingList(r)}
  <p class="little"><b>Keeping it.</b> ${esc(r.keeps)} Cool completely before it goes in a bag or box.</p>
  <p class="little"><b>For ${KID}.</b> ${esc(r.little)}</p>`);
}

function recipeSheet(id) {
  const r = recipe(id);
  if (r.kind) return prepSheet(r);
  openSheet(`${closer}
  <div class="art">${dish(r.id, r.name)}</div>
  <h2 id="sheetTitle">${esc(r.name)}</h2>
  <p class="facts">${r.hours} hours on low. Serves ${r.serves}. About ${r.protein} g protein a serving.</p>
  <p class="blurb">${esc(r.blurb)}</p>
  <h3>Cook it on</h3>
  <div class="chips wrap">${week().map(d => `<button class="chip" data-plan="${d.key}" data-id="${r.id}" aria-pressed="${state.plan[d.key] === r.id}">${d.i < 2 ? dayName(d) : d.date.toLocaleDateString('en-US', { weekday: 'short' })}</button>`).join('')}</div>
  ${ingList(r)}
  <p class="little"><b>For ${KID}.</b> ${esc(r.little)} Salt the grown-up plates at the table.</p>
  <p class="safe">Thaw meat before it goes in. ${r.hours >= 8 ? 'Most slow cookers switch to warm on their own, so a long work day is fine.' : 'If you will be out longer than this, set it to switch to warm.'}</p>`);
}

function pickSheet(key) {
  const d = week().find(x => x.key === key);
  const cur = state.plan[key];
  const list = [...DINNERS].sort((a, b) => missing(a).length - missing(b).length || b.protein - a.protein);
  openSheet(`${closer}
  <h2 id="sheetTitle">${d.i === 0 ? 'Dinner tonight' : 'Dinner ' + (d.i === 1 ? 'tomorrow' : 'on ' + dayName(d))}</h2>
  <p class="blurb">Listed with what you can already make first.</p>
  ${cur ? `<button class="btn line wide" data-plan="${key}" data-id="">Leave this night open</button>` : ''}
  <ul class="cards tight">${list.map(r => recipeRow(r, `data-plan="${key}" data-id="${r.id}" ${cur === r.id ? 'aria-current="true"' : ''}`)).join('')}</ul>`);
}

function servedSheet(id) {
  const r = recipe(id);
  const used = r.ings.filter(([iid]) => !cat(iid).staple && state.have[iid]);
  openSheet(`${closer}
  <h2 id="sheetTitle">Enjoy dinner</h2>
  <p class="blurb">${used.length ? 'What got used up? Anything ticked comes off the kitchen list.' : 'Nothing to clear from the kitchen list.'}</p>
  <ul class="found">${used.map(([iid]) => `<li><label><input type="checkbox" data-used="${iid}" ${['Meat', 'Produce', 'Cans and jars'].includes(cat(iid).section) ? 'checked' : ''}>
    <span>${esc(CATALOG[iid][0])}</span></label></li>`).join('')}</ul>
  <button class="btn wide" data-clear="${id}">Done</button>`);
}

// ---------------------------------------------------------------- photos

let snapKind = 'pantry';

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
  openSheet(`<h2 id="sheetTitle">Reading the ${what}</h2><p class="blurb">This takes a few seconds.</p><div class="working" aria-hidden="true"></div>`);
  try {
    const images = await Promise.all([...files].slice(0, 4).map(f => shrink(f)));
    const res = await fetch(API + '/read', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: snapKind, images, catalog: Object.keys(CATALOG).map(id => ({ id, name: CATALOG[id][0] })) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The photo reader did not answer. Try again in a minute.');
    reviewSheet(data);
  } catch (e) {
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
    shop.items.map(it => `- ${cat(it.id).name}${it.packs > 1 ? ' x' + it.packs : ''} (${cat(it.id).buy})`).join('\n');
}

// ---------------------------------------------------------------- events

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
}

document.addEventListener('click', e => {
  if (e.target.id === 'scrim') return closeSheet();
  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if ('close' in d) return closeSheet();
  if (d.tab) { tab = d.tab; render(); window.scrollTo(0, 0); return; }
  if (d.filter) { filter = d.filter; render(); return; }
  if (d.shelf) { shelfKind = d.shelf; render(); return; }
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
    if (!d.id || was === d.id) delete state.plan[d.plan]; else state.plan[d.plan] = d.id;
    if (d.plan === today() && state.cooking && state.cooking.id !== state.plan[d.plan]) state.cooking = null;
    save();
    if (b.classList.contains('chip')) { b.setAttribute('aria-pressed', state.plan[d.plan] === d.id); render(); return; }
    closeSheet(); render();
    return toast(state.plan[d.plan] ? `${recipe(d.id).name} is planned` : 'Night left open');
  }
  if (d.tonight) { state.plan[today()] = d.tonight; save(); render(); return toast('Planned for tonight'); }
  if (d.start) { state.plan[today()] = d.start; state.cooking = { id: d.start, start: Date.now() }; save(); render(); return toast('Timer started'); }
  if (d.served) return servedSheet(d.served);
  if (d.clear) {
    document.querySelectorAll('[data-used]:checked').forEach(box => { delete state.have[box.dataset.used]; });
    state.cooking = null; delete state.plan[today()];
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
    save();
    const top = $('#sheet').scrollTop;
    recipeSheet(d.rid); $('#sheet').scrollTop = top;
    $(`#sheet [data-ing="${d.ing}"]`)?.focus({ preventScroll: true });
    return render();
  }
  if (d.extra) { state.extra.splice(+d.extra, 1); save(); return render(); }
  if (d.bought) { state.have[d.bought] = true; save(); render(); return toast(`${CATALOG[d.bought][0]} is in the kitchen`); }
  if (d.snap) {
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
      <button class="btn wide" data-send-link>Send the link</button>`);
  }
  if ('sendLink' in d) return send({ title: 'Simmer', url: `${location.origin}${location.pathname}#house=${state.house}` }, 'Link copied');
  if ('dinner' in d) {
    return openSheet(`${closer}<h2 id="sheetTitle">What time is dinner?</h2>
      <p class="blurb">Simmer works back from this to tell you when the pot needs to go on.</p>
      <label class="time">Dinner time <input type="time" id="dinnerTime" value="${esc(state.dinner)}"></label>
      <button class="btn wide" data-set-dinner>Save</button>`);
  }
  if ('setDinner' in d) {
    const v = $('#dinnerTime').value;
    if (/^\d\d:\d\d$/.test(v)) { state.dinner = v; save(); }
    closeSheet(); return render();
  }
});

$('#photo').addEventListener('change', e => { if (e.target.files.length) readPhotos(e.target.files); });

document.addEventListener('submit', e => {
  if (e.target.id !== 'addExtra') return;
  e.preventDefault();
  const name = $('#extra').value.trim();
  if (!name) return;
  if (!state.extra.some(x => x.toLowerCase() === name.toLowerCase())) state.extra.push(name);
  save(); render(); $('#extra').focus();
});

document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { pull(); if ($('#sheet').hidden) render(); } });
setInterval(() => { if (tab === 'home' && $('#sheet').hidden && !document.hidden) render(); }, 60000);

keep();
render();
pull();
