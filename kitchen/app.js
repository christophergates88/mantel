// Simmer: a slow cooker kitchen for one household. Everything is kept on this phone.
import { CATALOG, RECIPES, SECTIONS } from './data.js';
import { READER_URL } from './config.js';

const KEY = 'simmer.v1';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + n.toFixed(2);
const cat = id => { const c = CATALOG[id]; return { id, name: c[0], section: c[1], w: c[2], i: c[3], buy: c[4], staple: !!c[5] }; };
const recipe = id => RECIPES.find(r => r.id === id);

// ---------------------------------------------------------------- state

function fresh() {
  const have = {};
  for (const id in CATALOG) if (CATALOG[id][5]) have[id] = true; // start with the spice shelf stocked
  return { have, extra: [], week: [], prices: {} };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.have) return { ...fresh(), ...s };
  } catch { /* storage can be unavailable; fall through to a fresh kitchen */ }
  return fresh();
}
let state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* keeps working for this visit */ }
}

let tab = 'home';
let filter = 'all';

// ---------------------------------------------------------------- sums

const price = (id, store) => state.prices[id]?.[store] ?? cat(id)[store];
const fromReceipt = (id, store) => state.prices[id]?.[store] != null;
const missing = r => r.ings.filter(([id]) => !state.have[id]);
const haveCount = r => r.ings.length - missing(r).length;

// What the week's meals still need, with packages added up across recipes.
function shopping() {
  const need = new Map();
  for (const rid of state.week) {
    const r = recipe(rid);
    if (!r) continue;
    for (const [id, , packs = 1] of r.ings) {
      if (state.have[id]) continue;
      const cur = need.get(id) || { id, packs: 0, for: [] };
      cur.packs += packs;
      cur.for.push(r.name);
      need.set(id, cur);
    }
  }
  const items = [...need.values()].sort((a, b) => SECTIONS.indexOf(cat(a.id).section) - SECTIONS.indexOf(cat(b.id).section));
  const total = store => items.reduce((sum, it) => sum + price(it.id, store) * it.packs, 0);
  return { items, w: total('w'), i: total('i') };
}

function bestTonight() {
  return [...RECIPES].sort((a, b) =>
    missing(a).length - missing(b).length || b.protein - a.protein)[0];
}

// ---------------------------------------------------------------- views

function board(lines) {
  return `<div class="board" aria-hidden="true">${lines.map(l => `<p class="${l[1] || ''}">${esc(l[0])}</p>`).join('')}</div>`;
}

function homeView() {
  const r = bestTonight();
  const miss = missing(r).length;
  const shop = shopping();
  const week = state.week.map(recipe).filter(Boolean);
  return `
  <button class="boardwrap" data-open="${r.id}" aria-label="Tonight: ${esc(r.name)}, ${r.hours} hours on low. Open the recipe.">
    ${board([['in the pot tonight', 'small'], [r.name, 'big'], [`${r.hours} hours on low`, 'small'],
             [miss ? `you have ${haveCount(r)} of ${r.ings.length}` : 'you have everything', 'small']])}
  </button>

  <div class="snap">
    <button class="btn" data-snap="pantry">Photograph the fridge or pantry</button>
    <button class="btn quiet" data-snap="receipt">Photograph a receipt</button>
  </div>

  <h2 class="shelf">This week</h2>
  ${week.length ? `<ul class="rows">${week.map(w => `
    <li><button class="row" data-open="${w.id}"><span class="name">${esc(w.name)}</span>
      <span class="meta">${w.hours} hrs, ${missing(w).length ? missing(w).length + ' to buy' : 'ready'}</span></button></li>`).join('')}</ul>
    ${shop.items.length ? `<button class="link" data-tab="list">${shop.items.length} ${shop.items.length === 1 ? 'thing' : 'things'} to buy, about ${money(Math.min(shop.w, shop.i))}</button>`
                        : `<p class="note">Everything for these is already in the kitchen.</p>`}`
  : `<p class="note">No meals picked yet. Open Recipes and add a few; the shopping list builds itself.</p>`}`;
}

const FILTERS = [['all', 'All'], ['allday', 'All day, 8+ hrs'], ['ready', 'Have everything'], ['protein', 'Most protein'], ['few', 'Fewest things']];

function recipesView() {
  let list = [...RECIPES];
  if (filter === 'allday') list = list.filter(r => r.hours >= 8);
  if (filter === 'ready') list = list.filter(r => !missing(r).length);
  if (filter === 'protein') list.sort((a, b) => b.protein - a.protein);
  if (filter === 'few') list.sort((a, b) => a.ings.length - b.ings.length);
  return `
  <div class="chips" role="group" aria-label="Filter recipes">
    ${FILTERS.map(([id, label]) => `<button class="chip" data-filter="${id}" aria-pressed="${filter === id}">${label}</button>`).join('')}
  </div>
  ${list.length ? `<ul class="cards">${list.map(r => {
    const m = missing(r).length;
    return `<li><button class="card" data-open="${r.id}">
      <span class="name">${esc(r.name)}</span>
      <span class="meta">${r.hours} hrs on low, about ${r.protein} g protein a serving</span>
      <span class="have ${m ? '' : 'ok'}">${m ? `You have ${haveCount(r)} of ${r.ings.length}` : 'You have everything'}${state.week.includes(r.id) ? ', on this week' : ''}</span>
    </button></li>`; }).join('')}</ul>`
  : `<p class="note">Nothing is fully stocked yet. Photograph the fridge and pantry, or tick things off in Kitchen.</p>`}`;
}

function kitchenView() {
  return `
  <div class="snap">
    <button class="btn" data-snap="pantry">Photograph the fridge or pantry</button>
    <button class="btn quiet" data-snap="receipt">Photograph a receipt</button>
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
  if (!state.week.length) return `<p class="note">Pick meals in Recipes and what you need shows up here, priced for Walmart and Ingles.</p>`;
  if (!shop.items.length) return `<p class="note">Nothing to buy. Everything for this week's meals is in the kitchen.</p>`;
  const cheaper = shop.w <= shop.i ? 'Walmart' : 'Ingles';
  const diff = Math.abs(shop.w - shop.i);
  return `
  <div class="verdict">
    <p class="pick">Go to ${cheaper}</p>
    <p>About ${money(diff)} less for this list.</p>
    <dl><div><dt>Walmart</dt><dd>${money(shop.w)}</dd></div><div><dt>Ingles</dt><dd>${money(shop.i)}</dd></div></dl>
  </div>
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
  const subs = { home: 'Slow cooker suppers, no sugar added', recipes: `${RECIPES.length} recipes, all low prep`, kitchen: 'What is in the house', list: 'What to buy, and where' };
  $('#sub').textContent = subs[tab];
  document.querySelectorAll('.tabs button').forEach(b => b.toggleAttribute('aria-current', b.dataset.tab === tab));
  document.querySelectorAll('.tabs button[aria-current]').forEach(b => b.setAttribute('aria-current', 'page'));
  const n = shopping().items.length;
  $('#listCount').hidden = !n;
  $('#listCount').textContent = n;
}

// ---------------------------------------------------------------- sheets

let lastFocus = null;
function openSheet(html) {
  lastFocus = document.activeElement;
  $('#sheet').innerHTML = html;
  $('#sheet').hidden = false; $('#scrim').hidden = false;
  document.body.classList.add('locked');
  $('#sheet').querySelector('button, input')?.focus();
}
function closeSheet() {
  $('#sheet').hidden = true; $('#scrim').hidden = true;
  document.body.classList.remove('locked');
  lastFocus?.focus?.();
}

function recipeSheet(id) {
  const r = recipe(id);
  const on = state.week.includes(id);
  openSheet(`
  <button class="close" data-close aria-label="Close">Close</button>
  <h2 id="sheetTitle">${esc(r.name)}</h2>
  <p class="facts">${r.hours} hours on low. Serves ${r.serves}. About ${r.protein} g protein a serving.</p>
  <p class="blurb">${esc(r.blurb)}</p>
  <h3>What goes in</h3>
  <ul class="ings">${r.ings.map(([iid, amt]) => `<li class="${state.have[iid] ? 'got' : 'need'}">
    <span>${esc(CATALOG[iid][0])}<small>${esc(amt)}</small></span><em>${state.have[iid] ? 'have' : 'need'}</em></li>`).join('')}</ul>
  <h3>How</h3>
  <ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
  <p class="little"><b>For the little one.</b> ${esc(r.little)} Salt the grown-up plates at the table.</p>
  <p class="safe">Thaw meat before it goes in. ${r.hours >= 8 ? 'Most slow cookers switch to warm on their own, so a long work day is fine.' : 'If you will be out longer, set it to switch to warm.'}</p>
  <button class="btn wide" data-week="${id}">${on ? 'Take off this week' : 'Add to this week'}</button>`);
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
    const res = await fetch(READER_URL.replace(/\/$/, '') + '/read', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: snapKind, images, catalog: Object.keys(CATALOG).map(id => ({ id, name: CATALOG[id][0] })) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'The photo reader did not answer. Try again in a minute.');
    reviewSheet(data);
  } catch (e) {
    openSheet(`<button class="close" data-close aria-label="Close">Close</button><h2 id="sheetTitle">The ${what} could not be read</h2>
      <p class="blurb">${esc(e.message || 'Check the connection and try again.')}</p>
      <p class="blurb">You can still tick things off by hand in Kitchen.</p>`);
  }
}

let pending = null;
function reviewSheet(data) {
  const items = (data.items || []).filter(it => it && (CATALOG[it.id] || it.name));
  pending = { items, store: data.store };
  if (!items.length) {
    return openSheet(`<button class="close" data-close aria-label="Close">Close</button><h2 id="sheetTitle">Nothing recognised</h2>
      <p class="blurb">Try again with more light, and the shelves or the receipt filling the frame.</p>`);
  }
  const storeName = { w: 'Walmart', i: 'Ingles' }[data.store];
  openSheet(`
  <button class="close" data-close aria-label="Close">Close</button>
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

// ---------------------------------------------------------------- events

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
}

document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (e.target.id === 'scrim') return closeSheet();
  if (!b) return;
  const d = b.dataset;
  if ('close' in d) return closeSheet();
  if (d.tab) { tab = d.tab; render(); window.scrollTo(0, 0); return; }
  if (d.filter) { filter = d.filter; render(); return; }
  if (d.open) return recipeSheet(d.open);
  if (d.week) {
    const on = state.week.includes(d.week);
    state.week = on ? state.week.filter(x => x !== d.week) : [...state.week, d.week];
    save(); closeSheet(); render();
    return toast(on ? 'Taken off this week' : 'Added to this week');
  }
  if (d.have) {
    if (state.have[d.have]) delete state.have[d.have]; else state.have[d.have] = true;
    save(); b.setAttribute('aria-pressed', !!state.have[d.have]);
    const n = shopping().items.length; $('#listCount').hidden = !n; $('#listCount').textContent = n;
    return;
  }
  if (d.extra) { state.extra.splice(+d.extra, 1); save(); return render(); }
  if (d.bought) { state.have[d.bought] = true; save(); render(); return toast(`${CATALOG[d.bought][0]} is in the kitchen`); }
  if (d.snap) {
    snapKind = d.snap;
    if (!READER_URL) {
      return openSheet(`<button class="close" data-close aria-label="Close">Close</button><h2 id="sheetTitle">Photos are not switched on yet</h2>
        <p class="blurb">The photo reader still needs to be connected. Until then, tick things off by hand in Kitchen.</p>`);
    }
    $('#photo').value = ''; $('#photo').click();
    return;
  }
  if ('keep' in d) return keepFound();
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

render();
