// Simmer: draws each dish as a small top-down illustration (a stoneware bowl on a walnut table).
// These are drawings made in code, not photographs.

const ART = {
  'pot-roast':        { base: '#5b3420', bits: [['chunk', '#74432a', 5, 15], ['potato', '#e6cd8f', 6], ['coin', '#e2812f', 7], ['leaf', '#55793f', 5]] },
  'carnitas':         { base: '#9a5e30', bits: [['shred', '#c48848', 46], ['shred', '#7c4a26', 22], ['wedge', '#a9c653', 2], ['leaf', '#4f7f3c', 7]] },
  'beef-chili':       { base: '#7a2d1c', bits: [['bean', '#531a17', 13], ['chunk', '#5e3020', 7, 8], ['dollop', '#fbf6ea', 1], ['leaf', '#5c8a40', 4]] },
  'beef-stew':        { base: '#6b3a1f', bits: [['chunk', '#7a472b', 6, 11], ['potato', '#e6cd8f', 5], ['coin', '#e2812f', 7], ['leaf', '#55793f', 4]] },
  'barbacoa':         { base: '#5a3320', bits: [['shred', '#7d4729', 44], ['shred', '#3f2416', 18], ['wedge', '#a9c653', 1], ['leaf', '#4f7f3c', 7]] },
  'turkey-chili':     { base: '#8a3a22', bits: [['chunk', '#c39a6e', 12, 5], ['bean', '#2b1d1a', 8], ['bean', '#6a211c', 8], ['leaf', '#5c8a40', 4]] },
  'lentil-stew':      { base: '#8a6a3a', bits: [['dot', '#6a4f24', 60], ['coin', '#e2812f', 8], ['leaf', '#3f6d3a', 8, 9], ['dollop', '#fbf6ea', 1]] },
  'burrito-bowl':     { base: '#efe6cf', bits: [['shred', '#d39c5c', 34], ['bean', '#2b1d1a', 12], ['dot', '#f1c737', 26, 2.6], ['dot', '#c8402a', 12, 3], ['leaf', '#4f7f3c', 6]] },
  'balsamic-chicken': { base: '#efe9dd', bits: [['chunk', '#7d4526', 4, 17], ['potato', '#e6cd8f', 6], ['stick', '#5f8f45', 10]] },
  'greek-chicken':    { base: '#f0ead9', bits: [['chunk', '#dba757', 4, 17], ['potato', '#ead48f', 7], ['wedge', '#f2d64a', 2], ['leaf', '#5c8a40', 7, 4]] },
  'white-chili':      { base: '#eee0bf', bits: [['shred', '#e2c08f', 26], ['bean', '#fbf5e3', 14], ['leaf', '#93b25c', 8, 4], ['dollop', '#fffdf6', 1]] },
  'coconut-chicken':  { base: '#e3ad44', bits: [['cube', '#e0742a', 8], ['chunk', '#f3dfb4', 6, 10], ['leaf', '#3f6d3a', 8, 9]] },
  'turkey-breast':    { base: '#efe9dd', bits: [['slice', '#efd9b2', 5], ['coin', '#e2812f', 8], ['leaf', '#55793f', 5]] },
  'chicken-marinara': { base: '#b5341f', bits: [['chunk', '#e8c690', 4, 14], ['melt', '#f8eed2', 5], ['leaf', '#3f7a3a', 6, 7]] },
  'banana-pancakes':  { base: '#efe9dd', bits: [['disc', '#d9a55b', 6, 13], ['dot', '#3d4a85', 6, 2.6]] },
  'egg-cups':         { base: '#efe9dd', bits: [['disc', '#f0cf62', 6, 12], ['leaf', '#3f6d3a', 9, 4]] },
  'oat-cups':         { base: '#efe9dd', bits: [['disc', '#c99a62', 6, 12], ['dot', '#3d4a85', 14, 2.4]] },
  'french-toast':     { base: '#efe9dd', bits: [['bar', '#dba24e', 8]] },
  'yogurt-muffins':   { base: '#efe9dd', bits: [['disc', '#d8b06e', 8, 9.5]] },
  'oat-cookies':      { base: '#efe9dd', bits: [['disc', '#c9a36b', 7, 10.5], ['dot', '#8a6a3a', 22, 1.2]] },
  'pb-bars':          { base: '#efe9dd', bits: [['bar', '#b98545', 7]] },
  'turkey-meatballs': { base: '#efe9dd', bits: [['disc', '#a9703f', 10, 7.5], ['leaf', '#55793f', 4]] },
  'broccoli-bites':   { base: '#efe9dd', bits: [['disc', '#a3b962', 8, 9], ['dot', '#4f7f3c', 20, 1.6]] },
  'sweet-potato-sticks': { base: '#efe9dd', bits: [['stick', '#e0742a', 14]] },
  'yogurt-drops':     { base: '#efe9dd', bits: [['disc', '#d9b3d6', 16, 4.2], ['disc', '#f8f3ee', 9, 4.2]] },
  'applesauce':       { base: '#e2c27c', bits: [['shred', '#eed59a', 16], ['dot', '#9a6a3a', 14, 1]] },
  'fajita-bowls':     { base: '#efe6cf', bits: [['shred', '#c98f4e', 26], ['stick', '#c8402a', 5], ['stick', '#e0a12a', 4], ['stick', '#5f8f45', 4], ['wedge', '#a9c653', 1]] },
  'tuscan-chicken':   { base: '#c9643a', bits: [['chunk', '#dba757', 5, 12], ['bean', '#fbf5e3', 12], ['leaf', '#3f6d3a', 8, 8]] },
  'sweet-potato-chili': { base: '#7a2d1c', bits: [['chunk', '#5e3020', 7, 9], ['cube', '#e0742a', 8], ['leaf', '#5c8a40', 3]] },
  'verde-pork':       { base: '#8a8f3a', bits: [['shred', '#c9a468', 44], ['shred', '#8b6a3a', 14], ['wedge', '#a9c653', 1], ['leaf', '#4f7f3c', 6]] },
  'turkey-taco':      { base: '#8a3a22', bits: [['chunk', '#c39a6e', 16, 4.5], ['bean', '#2b1d1a', 9], ['dot', '#f1c737', 20, 2.4], ['leaf', '#5c8a40', 4]] },
  'cacciatore':       { base: '#b5341f', bits: [['chunk', '#dba757', 4, 15], ['stick', '#e0532a', 5], ['stick', '#5f8f45', 4], ['leaf', '#3f7a3a', 5, 6]] },
  'pork-loin':        { base: '#efe9dd', bits: [['slice', '#edd3b4', 5], ['potato', '#e6cd8f', 5], ['coin', '#e2812f', 7], ['leaf', '#55793f', 4]] },
  'italian-beef':     { base: '#7a3320', bits: [['shred', '#7d4729', 44], ['shred', '#4a2a1a', 16], ['leaf', '#55793f', 6]] },
  'peanut-chicken':   { base: '#c98f45', bits: [['chunk', '#f0dcae', 6, 11], ['leaf', '#3f6d3a', 8, 8], ['wedge', '#a9c653', 1]] },
  'chicken-sp-chili': { base: '#8f3a20', bits: [['shred', '#e2c08f', 24], ['bean', '#2b1d1a', 12], ['cube', '#e0742a', 7], ['leaf', '#5c8a40', 4]] },
  'apple-oat-squares': { base: '#efe9dd', bits: [['bar', '#c99a62', 6]] },
  'turkey-patties':   { base: '#efe9dd', bits: [['disc', '#a9703f', 6, 11]] },
  'blueberry-bars':   { base: '#efe9dd', bits: [['bar', '#b98f5a', 6], ['dot', '#3d4a85', 10, 2.2]] },
  'bean-quesadillas': { base: '#efe9dd', bits: [['tri', '#e3c27a', 7]] },
  'pork-apples':      { base: '#efe9dd', bits: [['slice', '#eccaa8', 5], ['cube', '#e0742a', 7], ['crescent', '#f3e6b6', 5]] },
};

function rng(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shade = (hex, k) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('');
const f = n => n.toFixed(1);

function bit(kind, color, x, y, a, s, r) {
  const dark = shade(color, 0.72), light = shade(color, 1.18);
  const t = `transform="translate(${f(x)} ${f(y)}) rotate(${f(a)})"`;
  switch (kind) {
    case 'chunk': return `<g ${t}><path d="M${f(-s)} ${f(-s * .6)}Q${f(-s * .2)} ${f(-s * .95)} ${f(s * .8)} ${f(-s * .55)}Q${f(s * 1.1)} 0 ${f(s * .75)} ${f(s * .6)}Q0 ${f(s * .9)} ${f(-s * .85)} ${f(s * .5)}Q${f(-s * 1.15)} 0 ${f(-s)} ${f(-s * .6)}Z" fill="${color}" stroke="${dark}" stroke-width=".8"/><path d="M${f(-s * .5)} ${f(-s * .25)}Q0 ${f(-s * .5)} ${f(s * .45)} ${f(-s * .2)}" stroke="${light}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".7"/></g>`;
    case 'potato': return `<g ${t}><ellipse rx="8.5" ry="7" fill="${color}" stroke="${dark}" stroke-width=".8"/><ellipse cx="-2" cy="-2" rx="3.5" ry="2" fill="${light}" opacity=".6"/></g>`;
    case 'coin': return `<g ${t}><circle r="5.4" fill="${color}" stroke="${dark}" stroke-width=".8"/><circle r="2.4" fill="none" stroke="${light}" stroke-width=".9"/></g>`;
    case 'bean': return `<g ${t}><ellipse rx="5" ry="3" fill="${color}" stroke="${dark}" stroke-width=".7"/><path d="M-2.5 -.8Q0 -2 2.5 -.8" stroke="${light}" stroke-width=".8" fill="none" opacity=".7"/></g>`;
    case 'leaf': return `<path ${t} d="M${f(-s)} 0Q0 ${f(-s * .8)} ${f(s)} 0Q0 ${f(s * .8)} ${f(-s)} 0Z" fill="${color}" stroke="${dark}" stroke-width=".5"/>`;
    case 'shred': return `<path ${t} d="M-7 0Q-2 ${f(-3 + r * 6)} 7 ${f(-1 + r * 2)}" stroke="${color}" stroke-width="${f(2.2 + r * 1.6)}" fill="none" stroke-linecap="round"/>`;
    case 'dot': return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="${color}" stroke="${dark}" stroke-width=".4"/>`;
    case 'stick': return `<rect ${t} x="-11" y="-1.9" width="22" height="3.8" rx="1.9" fill="${color}" stroke="${dark}" stroke-width=".6"/>`;
    case 'cube': return `<g ${t}><rect x="-5.5" y="-5.5" width="11" height="11" rx="2.2" fill="${color}" stroke="${dark}" stroke-width=".8"/><rect x="-3.5" y="-3.8" width="5" height="2.4" rx="1.2" fill="${light}" opacity=".6"/></g>`;
    case 'wedge': return `<g ${t}><path d="M-11 0A11 11 0 0 1 11 0Z" fill="${color}" stroke="${dark}" stroke-width=".8"/><path d="M-8 -1A8 8 0 0 1 8 -1Z" fill="${light}" opacity=".75"/><path d="M0 -1V-8M-4 -1L-5.5 -6.5M4 -1L5.5 -6.5" stroke="${color}" stroke-width=".7"/></g>`;
    case 'dollop': return `<g transform="translate(${f(x)} ${f(y)})"><path d="M-11 1Q-12 -8 -2 -9Q9 -11 11 -1Q12 8 1 9Q-9 10 -11 1Z" fill="${color}" stroke="#e2d9c4" stroke-width=".8"/><path d="M-5 -1Q-1 -6 4 -2" stroke="#e9e1cf" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>`;
    case 'melt': return `<path ${t} d="M-12 0Q-13 -8 -3 -8Q3 -12 9 -6Q15 -2 10 5Q5 11 -3 8Q-11 9 -12 0Z" fill="${color}" stroke="#e6d6ad" stroke-width=".8" opacity=".95"/>`;
    case 'slice': return `<g ${t}><ellipse rx="15" ry="8.5" fill="${color}" stroke="${shade(color, .62)}" stroke-width="1.6"/><path d="M-8 -2Q0 -5 8 -2" stroke="${light}" stroke-width="1.2" fill="none" opacity=".8"/></g>`;
    case 'disc': return `<g transform="translate(${f(x)} ${f(y)})"><circle r="${f(s)}" fill="${color}" stroke="${dark}" stroke-width="1"/><path d="M${f(-s * .55)} ${f(-s * .25)}A${f(s * .65)} ${f(s * .65)} 0 0 1 ${f(s * .3)} ${f(-s * .6)}" stroke="${light}" stroke-width="${f(Math.max(1, s * .16))}" fill="none" stroke-linecap="round" opacity=".75"/></g>`;
    case 'bar': return `<g ${t}><rect x="-13" y="-5.5" width="26" height="11" rx="2.5" fill="${color}" stroke="${dark}" stroke-width="1"/><path d="M-9 -2H7" stroke="${light}" stroke-width="1.4" stroke-linecap="round" opacity=".7"/></g>`;
    case 'tri': return `<g ${t}><path d="M-12 8L12 8L0 -11Z" fill="${color}" stroke="${dark}" stroke-width="1" stroke-linejoin="round"/><path d="M-5 4H5M-2 -1H2" stroke="${dark}" stroke-width="1.2" stroke-linecap="round" opacity=".5"/></g>`;
    case 'crescent': return `<g ${t}><path d="M-10 2A10.5 10.5 0 0 1 10 2Q0 -3 -10 2Z" fill="${color}" stroke="#b33a2c" stroke-width="1.6" stroke-linejoin="round"/></g>`;
  }
  return '';
}

const cache = {};
export const LOOKS = Object.keys(ART);
export function dish(id, name = '', look = '') {
  if (cache[id]) return cache[id];
  const art = ART[id] || ART[look] || { base: '#8a5a34', bits: [['chunk', '#74432a', 6, 10], ['leaf', '#55793f', 5]] };
  const rand = rng(id);
  const cx = 100, cy = 76, R = 47;
  let grain = '';
  for (let i = 0; i < 9; i++) {
    const y = 8 + i * 17 + rand() * 6;
    grain += `<path d="M0 ${f(y)}Q${f(50 + rand() * 30)} ${f(y - 4 + rand() * 8)} 100 ${f(y + rand() * 3)}T200 ${f(y - 2 + rand() * 5)}" stroke="#3b2516" stroke-width="${f(.6 + rand())}" fill="none" opacity=".45"/>`;
  }
  let food = '';
  for (const [kind, color, count, size] of art.bits) {
    for (let i = 0; i < count; i++) {
      const fan = kind === 'slice';
      const big = kind === 'dollop' || kind === 'wedge';
      const rad = fan ? 0 : Math.sqrt(rand()) * (big ? R * .45 : R - 9);
      const ang = rand() * Math.PI * 2;
      const x = fan ? cx - 26 + i * 13 : cx + Math.cos(ang) * rad;
      const y = fan ? cy - 8 + (i % 2) * 3 : cy + Math.sin(ang) * rad;
      const s = size || (kind === 'leaf' ? 5.5 : kind === 'dot' ? 1.7 : 9);
      food += bit(kind, color, x, y, fan ? -18 + i * 6 : rand() * 360, s * (kind === 'dot' ? 1 : .85 + rand() * .3), rand());
    }
  }
  const uid = 'd' + id.replace(/[^a-z]/g, '');
  const svg = `<svg class="dish" viewBox="0 0 200 152" role="img" aria-label="${name ? 'Drawing of ' + name.replace(/"/g, '') : 'Drawing of the dish'}" preserveAspectRatio="xMidYMid slice">
<defs><radialGradient id="${uid}g" cx=".4" cy=".35"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/></radialGradient><clipPath id="${uid}c"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>
<rect width="200" height="152" fill="#5b3a23"/><rect width="200" height="152" fill="#6f4a2d" opacity=".55"/>${grain}
<path d="M138 -6L212 28L196 96L132 60Z" fill="#e9e2d3"/><path d="M146 6L200 32M141 22L196 50M137 38L192 66" stroke="#cfc6b3" stroke-width="1"/>
<ellipse cx="${cx + 3}" cy="${cy + 6}" rx="63" ry="61" fill="#1c120a" opacity=".38"/>
<circle cx="${cx}" cy="${cy}" r="61" fill="#f4efe4"/><circle cx="${cx}" cy="${cy}" r="61" fill="none" stroke="#d9d0bd" stroke-width="1.5"/>
<circle cx="${cx}" cy="${cy}" r="52" fill="#e6dfd0"/>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="${art.base}"/>
<g clip-path="url(#${uid}c)">${food}</g>
<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#${uid}g)"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="2"/>
</svg>`;
  return (cache[id] = svg);
}
