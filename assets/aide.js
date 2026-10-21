// Torvard's assistant, for the website demo. The same rules as the app's on-device assistant, answering from an
// example household (the Riveras). Runs in the visitor's browser; nothing is sent anywhere.

import { parseCapture, formatMoney, startOfDay, addDays, daysBetween, KIND_LABELS } from './engine.js';

// ---------------------------------------------------------------------------------------------------------------
// The example household, dated around today so the answers always make sense.

export function exampleHousehold(now = new Date()) {
  const today = startOfDay(now);
  const d = days => addDays(today, days);
  const monthsAgo = n => new Date(today.getFullYear(), today.getMonth() - n, today.getDate());
  const yearsFromNow = (y, m = 0) => new Date(today.getFullYear() + y, today.getMonth() + m, 1);
  const bday = (years, inDays) => { const x = d(inDays); return new Date(x.getFullYear() - years, x.getMonth(), x.getDate()); };
  return {
    people: [
      { id: 'alex', name: 'Alex Rivera', relation: 'me', bloodType: 'O+', allergies: '', birthday: bday(38, 140), doctor: 'Dr. Lena Okafor' },
      { id: 'jordan', name: 'Jordan Rivera', relation: 'spouse', bloodType: 'A-', allergies: 'shellfish', birthday: bday(37, 61) },
      { id: 'sam', name: 'Sam Rivera', relation: 'child', bloodType: '', allergies: 'penicillin', birthday: bday(4, 12), doctor: 'Dr. Priya Patel' },
      { id: 'biscuit', name: 'Biscuit', relation: 'pet', allergies: '', birthday: bday(6, 200), doctor: 'Oak Street Vet' },
    ],
    docs: [
      { id: 'd1', title: 'Passport', kind: 'passport', owner: 'alex', expires: yearsFromNow(2, 5), location: 'the fire safe in the hall closet' },
      { id: 'd2', title: "Driver's license", kind: 'driversLicense', owner: 'jordan', expires: d(19), location: '' },
      { id: 'd3', title: "Sam's birth certificate", kind: 'birthCertificate', owner: 'sam', expires: null, location: 'the fire safe' },
      { id: 'd4', title: 'Will', kind: 'will', owner: null, expires: null, location: 'Jordan\'s desk, top drawer, and a copy with our lawyer' },
    ],
    policies: [
      { id: 'p1', kind: 'auto', label: 'Auto', carrier: 'State Farm', renews: d(41), premium: 16400, per: 'mo', claims: '800-732-5246', agent: 'Maria Lopez, 478-555-0142' },
      { id: 'p2', kind: 'home', label: 'Homeowners', carrier: 'Allstate', renews: d(152), premium: 168000, per: 'yr', claims: '800-255-7828', agent: '' },
    ],
    bills: [
      { id: 'b1', name: 'Netflix', amount: 1799, was: 1549, raised: d(-40), sub: true, category: 'streaming', due: d(4), every: 'month' },
      { id: 'b2', name: 'Hulu', amount: 1899, sub: true, category: 'streaming', due: d(12), every: 'month' },
      { id: 'b3', name: 'Spotify', amount: 1199, sub: true, category: 'music', due: d(8), every: 'month' },
      { id: 'b4', name: 'Peacock', amount: 1099, sub: true, category: 'streaming', due: d(3), every: 'month', trialEnds: d(3) },
      { id: 'b5', name: 'iCloud+', amount: 299, sub: true, category: 'cloud', due: d(17), every: 'month' },
      { id: 'b6', name: 'Georgia Power', amount: 14218, sub: false, category: 'utilities', due: d(2), every: 'month', autopay: true },
      { id: 'b7', name: 'Water', amount: 6400, sub: false, category: 'utilities', due: d(9), every: 'month' },
      { id: 'b8', name: 'Mortgage', amount: 184000, sub: false, category: 'housing', due: d(11), every: 'month', autopay: true },
      { id: 'b9', name: 'Xfinity internet', amount: 7999, sub: false, category: 'internet', due: d(15), every: 'month' },
      { id: 'b10', name: 'Daycare', amount: 41000, sub: false, category: 'childcare', due: d(5), every: 'week' },
    ],
    tasks: [
      { id: 't1', title: 'Replace HVAC air filter', due: d(-2), lastDone: monthsAgo(3), area: 'home' },
      { id: 't2', title: 'Take out recycling', due: d(0), area: 'home' },
      { id: 't3', title: "Book Sam's 4-year checkup", due: d(1), area: 'health' },
      { id: 't4', title: 'Clean the gutters', due: d(9), lastDone: monthsAgo(6), area: 'home' },
      { id: 't5', title: 'Test smoke and CO alarms', due: d(6), lastDone: monthsAgo(6), area: 'home' },
    ],
    contacts: [
      { id: 'c1', name: 'Ace Plumbing', role: 'plumber', phone: '(555) 010-6611', note: 'Ask for Luis.' },
      { id: 'c2', name: 'Dr. Priya Patel', role: 'pediatrician', phone: '(555) 010-2290' },
      { id: 'c3', name: 'Bright Spark Electric', role: 'electrician', phone: '(555) 010-4415' },
      { id: 'c4', name: 'Oak Street Vet', role: 'vet', phone: '(555) 010-7788' },
    ],
    vehicles: [
      { id: 'v1', name: 'CR-V', make: 'Honda', registration: d(122), lastOil: d(-74), lastOilMiles: 41200 },
    ],
    projects: [
      { id: 'h1', title: 'Kitchen painted', room: 'Kitchen', date: monthsAgo(26), materials: 'Sherwin-Williams Agreeable Gray (SW 7029), eggshell', by: 'Alex and Jordan' },
      { id: 'h2', title: 'New water heater', room: 'Garage', date: monthsAgo(14), materials: 'Rheem 50 gal', by: 'Ace Plumbing', cost: 168000 },
      { id: 'h3', title: 'Roof replaced', room: 'Roof', date: monthsAgo(40), materials: 'GAF Timberline HDZ, Charcoal', by: 'Peach State Roofing', cost: 1240000 },
    ],
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Text helpers

const DOC_LABEL = { passport: 'passport', driversLicense: "driver's license", birthCertificate: 'birth certificate', will: 'will' };
const STOP = new Set(('the a an my our is are was were be do does did when what whats how much many who whos where wheres i me we us to for of on in at and or it its this that next last time have has had can you your about get got need expire expires expiration renew renews renewal due date day days until till long since ago any anything please tell show find check with up out go going come coming from by number phone spend spending cost costs pay paying paid per month monthly year yearly total should would could let know there they them their he she his her him s changed done last mark just finished completed').split(' '));
const SYN = { licence: 'license', dl: 'license', driver: 'license', tag: 'registration', tags: 'registration', auto: 'car', truck: 'car', vehicle: 'car', suv: 'car', crv: 'car', ac: 'hvac', furnace: 'hvac', homeowner: 'home', homeowners: 'home', house: 'home', physician: 'doctor', doc: 'doctor' };

function stem(w) {
  w = w.replace(/'s$/, '').replace(/'$/, '');
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  return w;
}
function words(text) {
  const set = new Set();
  for (const part of String(text).toLowerCase().replace(/’/g, "'").split(/[^a-z0-9']+/)) {
    if (part.length < 2) continue;
    const s = stem(part);
    set.add(SYN[s] || s);
  }
  return set;
}
const content = text => new Set([...words(text)].filter(w => !STOP.has(w)));
const overlap = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n += 1; return n; };
const has = (q, list) => list.some(x => q.includes(x));
const hasWord = (q, list) => list.some(x => new RegExp(`\\b${x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(q));
const first = name => name.split(' ')[0];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const low = s => (/^[A-Z][A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const num = n => (n >= 0 && n < NUM.length ? NUM[n] : String(n));
const count = (n, noun) => cap(`${num(n)} ${noun}${n === 1 ? '' : 's'}`);
function list(items) {
  if (items.length < 2) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}
const money = cents => formatMoney(cents, { whole: cents % 100 === 0 });
const whole = cents => formatMoney(cents, { whole: true });

function longDate(date, now) {
  const opts = { month: 'long', day: 'numeric' };
  if (date.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return new Intl.DateTimeFormat('en-US', opts).format(date);
}
function dayInline(date, now) {
  const n = daysBetween(startOfDay(now), startOfDay(date));
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1 && n < 7) return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date);
  return longDate(date, now);
}
function relative(date, now) {
  const n = daysBetween(startOfDay(now), startOfDay(date));
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1 && n < 45) return `in ${n} days`;
  if (n >= 45 && n < 548) return `in about ${Math.round(n / 30.4)} months`;
  if (n >= 548) { const y = Math.round((n / 365.25) * 2) / 2; return `in about ${y} years`; }
  if (n > -45) return `${-n} days ago`;
  if (n > -548) return `about ${Math.round(-n / 30.4)} months ago`;
  const y = Math.round(-n / 365.25);
  return `about ${y} year${y === 1 ? '' : 's'} ago`;
}
function nextBirthday(birthday, now) {
  const today = startOfDay(now);
  let next = new Date(today.getFullYear(), birthday.getMonth(), birthday.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, birthday.getMonth(), birthday.getDate());
  return next;
}
const perYear = { week: 52, month: 12, year: 1 };
const monthly = b => Math.round((b.amount * perYear[b.every]) / 12);

// ---------------------------------------------------------------------------------------------------------------
// The assistant

export class Aide {
  constructor(house, now = new Date()) {
    this.h = house;
    this.now = now;
    this.today = startOfDay(now);
  }

  person(id) { return this.h.people.find(p => p.id === id); }

  answer(raw) {
    let q = String(raw).toLowerCase().replace(/’/g, "'").replace(/[^a-z0-9$'.\s/-]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[.?!]+$/, '');
    for (const opener of ['hey ', 'ok ', 'okay ', 'so ', 'please ', 'can you tell me ', 'tell me ', 'do you know ']) if (q.startsWith(opener)) q = q.slice(opener.length);
    if (!q) return this.help();
    return this.add(raw, q) || this.complete(q)
      || (has(q, ['what can you do', 'help me', 'what can i ask']) || q === 'help' ? this.help() : null)
      || (this.isBrief(q) ? this.brief() : null)
      || (has(q, ['price increase', 'went up', 'gone up', 'raised', 'increases', 'more expensive']) ? this.increases() : null)
      || (has(q, ['overdue', 'past due', 'behind on', 'missed']) ? this.overdue() : null)
      || this.contact(q) || this.personQ(q) || this.where(q) || this.paint(q)
      || (has(q, ['when did', 'last time', 'last changed', 'last done', 'last oil', 'how long since', 'how long ago']) ? this.lastDone(q) : null)
      || (has(q, ['how much', 'spend', 'spending', 'cost', 'pay for', 'paying for', 'a month', 'a year', 'per month', 'budget', 'total']) ? this.spend(q) : null)
      || (has(q, ['subscriptions', 'subscription', 'what am i paying']) ? this.subscriptions() : null)
      || this.when(q)
      || this.dueWindow(q)
      || this.search(q);
  }

  // Commands --------------------------------------------------------------------------------------------------

  add(raw, q) {
    const leaders = ['please remind me to ', 'remind me to ', 'remind me ', "don't let me forget to ", 'dont let me forget to ',
      'set a reminder to ', 'add a task to ', 'add ', 'remember to ', 'new task '];
    const leader = leaders.find(l => q.startsWith(l));
    if (!leader) return null;
    const body = String(raw).trim().slice(String(raw).toLowerCase().replace(/’/g, "'").indexOf(leader.trim()) + leader.trim().length).trim().replace(/^to\s+/i, '').replace(/[.!?]+$/, '');
    if (!body) return { text: "What should I add? Say it the way you'd tell a friend." };
    const r = parseCapture(body, this.now);
    if (!r.title) return null;
    const parts = [];
    if (r.date) {
      const day = dayInline(r.date, this.now);
      parts.push(r.hasTime ? `${day} at ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(r.date)}` : day);
    }
    if (r.amount != null) parts.push(money(r.amount));
    if (r.repeats) parts.push(r.repeats.label.toLowerCase());
    const kind = (KIND_LABELS[r.kind] || 'Task').toLowerCase().replace('renewal', 'document');
    return { text: `I'll add a ${kind}: ${r.title}${parts.length ? ` (${parts.join(', ')})` : ''}. Want me to add it?`, action: `Add ${kind}`, done: `Added. I'll remind you${r.date ? ` ${dayInline(r.date, this.now)}` : ''}.` };
  }

  complete(q) {
    const leaders = ['mark ', 'i just ', 'i finished ', 'i did ', 'i paid ', 'paid ', 'i changed ', 'i replaced ', 'check off '];
    const leader = leaders.find(l => q.startsWith(l));
    if (!leader) return null;
    let target = q.slice(leader.length).replace(/ (as )?(done|complete|paid|off|today)$/, '');
    if (leader === 'i changed ' || leader === 'i replaced ') target = leader.slice(2) + target;
    const w = content(target);
    if (!w.size) return null;
    const payment = leader.includes('paid') || /paid$/.test(q);
    const bills = this.rank(this.h.bills, b => overlap(w, words(`${b.name} ${b.category}`)));
    const tasks = this.rank(this.h.tasks, t => overlap(w, words(t.title)));
    if (payment && bills[0]) return { text: `Mark ${bills[0].name} (${money(bills[0].amount)}) paid and move it to the next due date?`, action: 'Mark paid', done: `${bills[0].name} marked paid.` };
    if (tasks[0]) return { text: `Mark "${tasks[0].title}" done?`, action: 'Mark done', done: `Done. I'll bring "${low(tasks[0].title)}" back when it's due again.` };
    if (bills[0]) return { text: `Mark ${bills[0].name} paid?`, action: 'Mark paid', done: `${bills[0].name} marked paid.` };
    return null;
  }

  rank(items, score) {
    return items.map((item, i) => ({ item, s: score(item), i })).filter(x => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.item);
  }

  // Brief and agenda ------------------------------------------------------------------------------------------

  isBrief(q) {
    return has(q, ['brief', 'rundown', 'good morning', 'morning', 'what do i need to know', 'catch me up', 'update me', 'summary', "what's up", 'whats up', 'my day', "how's it looking"]) || ['hi', 'hello', 'hey'].includes(q);
  }

  agenda(start, end, withOverdue) {
    const now = this.now;
    const items = [];
    const inWin = date => date >= start && date < (end > start ? end : addDays(start, 1));
    const late = date => startOfDay(date) < this.today;
    for (const t of this.h.tasks) {
      const over = late(t.due);
      if ((over && withOverdue) || (!over && inWin(t.due))) items.push({ date: t.due, title: t.title, inline: low(t.title), over, detail: over ? `Overdue since ${dayInline(t.due, now)}` : `Due ${dayInline(t.due, now)}`, icon: 'check' });
    }
    for (const b of this.h.bills) {
      if (inWin(b.due)) items.push({ date: b.due, title: b.name, inline: b.name, over: false, amount: b.amount, detail: `${money(b.amount)}${b.autopay ? ' · autopay' : ''} · ${dayInline(b.due, now)}`, icon: b.sub ? 'repeat' : 'card' });
      if (b.trialEnds && inWin(b.trialEnds)) items.push({ date: b.trialEnds, title: `${b.name} trial ends`, inline: `the ${b.name} trial ending`, over: false, detail: `Then ${money(b.amount)}/mo`, icon: 'hourglass' });
    }
    for (const doc of this.h.docs) {
      if (doc.expires && inWin(doc.expires)) {
        const owner = this.person(doc.owner);
        const title = owner ? (owner.relation === 'me' ? `Your ${DOC_LABEL[doc.kind]}` : `${first(owner.name)}'s ${DOC_LABEL[doc.kind]}`) : doc.title;
        items.push({ date: doc.expires, title, inline: title.replace(/^Your/, 'your'), over: false, detail: `Expires ${longDate(doc.expires, now)}`, icon: 'doc', renewal: 'expires' });
      }
    }
    for (const p of this.h.policies) if (inWin(p.renews)) items.push({ date: p.renews, title: `${p.label} insurance renews`, inline: `${low(p.label)} insurance renewing`, over: false, detail: `${p.carrier} · ${longDate(p.renews, now)}`, icon: 'doc', renewal: '' });
    for (const v of this.h.vehicles) if (inWin(v.registration)) items.push({ date: v.registration, title: `${v.name} registration`, inline: `the ${v.name} registration`, over: false, detail: `Due ${longDate(v.registration, now)}`, icon: 'doc', renewal: 'expires' });
    for (const p of this.h.people) {
      const next = nextBirthday(p.birthday, start);
      if (inWin(next)) {
        const turns = next.getFullYear() - p.birthday.getFullYear();
        items.push({ date: next, title: `${first(p.name)}'s birthday`, inline: `${first(p.name)}'s birthday`, over: false, detail: p.relation === 'pet' ? 'Birthday' : `Turns ${turns}`, icon: 'cal' });
      }
    }
    return items.sort((a, b) => (a.over !== b.over ? (a.over ? -1 : 1) : a.date - b.date));
  }

  brief() {
    const now = this.now;
    const all = this.agenda(this.today, addDays(this.today, 31), true);
    const over = all.filter(i => i.over);
    const todays = all.filter(i => !i.over && daysBetween(this.today, startOfDay(i.date)) === 0);
    const week = this.h.bills.filter(b => b.due >= this.today && b.due < addDays(this.today, 7));
    const trial = this.h.bills.find(b => b.trialEnds && b.trialEnds >= this.today && b.trialEnds < addDays(this.today, 5));
    const renewal = all.find(i => i.renewal !== undefined && !i.over);
    const h = now.getHours();
    const s = [h >= 4 && h < 12 ? 'Good morning, Alex.' : h >= 12 && h < 17 ? 'Good afternoon, Alex.' : 'Good evening, Alex.'];
    if (over.length) s.push(`${count(over.length, 'thing')} overdue, starting with ${over[0].inline}.`);
    if (todays.length === 1) s.push(`Today: ${todays[0].inline}.`);
    else if (todays.length > 1) s.push(`${count(todays.length, 'thing')} today, starting with ${todays[0].inline}.`);
    if (trial) s.push(`Your ${trial.name} trial ends ${dayInline(trial.trialEnds, now)}, then it's ${money(trial.amount)}/mo.`);
    if (week.length) {
      const total = week.reduce((t, b) => t + b.amount, 0);
      const auto = week.filter(b => b.autopay).length;
      s.push(`${count(week.length, 'bill')} this week, ${money(total)} in all${auto === week.length ? ', all on autopay' : auto ? `, ${num(auto)} on autopay` : ''}.`);
    }
    if (renewal) s.push(`${renewal.title} ${renewal.renewal ? `${renewal.renewal} ` : ''}${relative(renewal.date, now)}.`);
    const raised = this.h.bills.find(b => b.was && b.raised >= addDays(this.today, -60));
    if (raised) s.push(`Heads up: ${raised.name} went up from ${money(raised.was)} to ${money(raised.amount)}.`);
    const items = [...over, ...todays, ...all.filter(i => !i.over && i.date >= addDays(this.today, 1) && i.date < addDays(this.today, 7))].slice(0, 6);
    return { text: s.join(' '), items, follow: ["What's overdue?", 'Any price increases?'] };
  }

  window(q) {
    const t = this.today;
    const m = q.match(/(?:next|coming|within)\s+(\d{1,3}|a|two|three|four|five|six|seven|ten)\s+(day|week|month)s?/);
    if (m) {
      const n = Number(m[1]) || { a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10 }[m[1]] || 1;
      const daysN = m[2] === 'day' ? n : m[2] === 'week' ? n * 7 : n * 30;
      return [t, addDays(t, daysN + 1), `in the next ${daysN} days`, true];
    }
    if (q.includes('tomorrow')) return [addDays(t, 1), addDays(t, 2), 'tomorrow', false];
    if (q.includes('today') || q.includes('tonight')) return [t, addDays(t, 1), 'today', true];
    if (q.includes('weekend')) {
      const wd = t.getDay();
      const sat = addDays(t, wd === 0 ? -1 : 6 - wd);
      return [sat > t ? sat : t, addDays(sat, 2), 'this weekend', false];
    }
    if (q.includes('next week')) return [addDays(t, 7), addDays(t, 14), 'next week', false];
    if (q.includes('week')) return [t, addDays(t, 7), 'this week', true];
    if (q.includes('next month')) { const s = new Date(t.getFullYear(), t.getMonth() + 1, 1); return [s, new Date(t.getFullYear(), t.getMonth() + 2, 1), 'next month', false]; }
    if (q.includes('month')) return [t, new Date(t.getFullYear(), t.getMonth() + 1, 1), 'this month', true];
    return null;
  }

  dueWindow(q) {
    let w = this.window(q);
    if (!w) {
      if (!has(q, ['due', 'coming up', 'upcoming', 'on my plate', "what's next", 'to do', 'todo', 'agenda', 'schedule'])) return null;
      w = [this.today, addDays(this.today, 14), 'in the next two weeks', true];
    }
    const [start, end, label, withOverdue] = w;
    const items = this.agenda(start, end, withOverdue);
    const over = items.filter(i => i.over);
    const up = items.filter(i => !i.over);
    if (!items.length) return { text: `Nothing is due ${label}. You're clear.` };
    const billTotal = up.reduce((t, i) => t + (i.amount || 0), 0);
    let text = up.length
      ? `${count(up.length, 'thing')} ${label}${billTotal ? `, ${money(billTotal)} in bills` : ''}: ${up.length > 3 ? `${up.slice(0, 3).map(i => `${i.inline} ${this.shortWhen(i.date)}`).join(', ')}, and ${up.length - 3} more` : list(up.map(i => `${i.inline} ${this.shortWhen(i.date)}`))}`
      : `Nothing new is due ${label}`;
    if (over.length) text += `. Also ${num(over.length)} overdue`;
    return { text: `${text}.`, items: items.slice(0, 8), follow: over.length ? ["What's overdue?"] : ["What's due next week?"] };
  }

  shortWhen(date) {
    const n = daysBetween(this.today, startOfDay(date));
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n > 1 && n < 7) return `on ${new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date)}`;
    return `on ${longDate(date, this.now)}`;
  }

  overdue() {
    const items = this.agenda(this.today, this.today, true).filter(i => i.over);
    if (!items.length) return { text: 'Nothing is overdue. Nice work.' };
    return { text: `${count(items.length, 'thing')} overdue: ${list(items.slice(0, 3).map(i => i.inline))}.`, items, follow: ['I changed the HVAC filter'] };
  }

  // When does it expire, renew, come due? ---------------------------------------------------------------------

  entities() {
    const e = [];
    const add = (name, extra, kind, rec) => { const nw = words(name); e.push({ name: nw, all: new Set([...nw, ...words(extra)]), kind, rec }); };
    for (const b of this.h.bills) add(b.name, `${b.category} ${b.sub ? 'subscription' : 'bill'}`, 'bill', b);
    for (const d of this.h.docs) add(`${d.title} ${DOC_LABEL[d.kind] || ''}`, `${this.person(d.owner)?.name || ''} document ${d.kind === 'driversLicense' ? 'license driver dl id' : ''}`, 'doc', d);
    for (const p of this.h.policies) add(`${p.label} insurance`, `${p.carrier} policy ${p.kind === 'auto' ? 'car vehicle' : 'house homeowner'}`, 'policy', p);
    for (const v of this.h.vehicles) add(`${v.name} registration`, `${v.make} car vehicle truck tag inspection oil`, 'vehicle', v);
    for (const p of this.h.people) add(p.name, `${p.relation} birthday`, 'person', p);
    for (const t of this.h.tasks) add(t.title, t.area, 'task', t);
    for (const h of this.h.projects) add(h.title, `${h.room} ${h.by}`, 'project', h);
    for (const c of this.h.contacts) add(c.name, c.role, 'contact', c);
    return e;
  }

  mentioned(q) {
    const w = words(q);
    let found = this.h.people.filter(p => overlap(w, words(p.name)) > 0);
    if (!found.length) {
      const rel = { wife: 'spouse', husband: 'spouse', spouse: 'spouse', son: 'child', daughter: 'child', kid: 'child', dog: 'pet', pet: 'pet' };
      const wanted = Object.entries(rel).filter(([k]) => w.has(stem(k))).map(([, v]) => v);
      found = this.h.people.filter(p => wanted.includes(p.relation));
      if (!found.length && (/\bi\b/.test(q) || has(q, ['my blood', 'my allerg', 'my doctor', 'my birthday']))) found = this.h.people.filter(p => p.relation === 'me');
    }
    return found;
  }

  score(ent, w, q) {
    const n = overlap(w, ent.name);
    const o = overlap(w, ent.all) - n;
    if (n + o === 0) return 0;
    let s = n * 3 + o;
    const named = this.mentioned(q)[0];
    if (ent.kind === 'doc') {
      if (named) s += ent.rec.owner === named.id ? 3 : -2;
      else if (q.includes('my ') && this.person(ent.rec.owner)?.relation === 'me') s += 1;
    }
    if (ent.kind === 'person' && !this.mentioned(q).includes(ent.rec) && !q.includes('birthday')) s -= 1;
    return s;
  }

  when(q) {
    if (!has(q, ['when', 'expire', 'expiration', 'renew', 'renewal', 'due date', 'is due', 'registration', 'warranty', 'trial end', 'how long until', 'how many days', 'birthday'])) return null;
    const w = content(q);
    const ranked = this.entities().map(e => ({ e, s: this.score(e, w, q) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
    if (!ranked.length) return null;
    const top = ranked.filter(x => x.s === ranked[0].s).slice(0, 3).map(x => x.e);
    const lines = top.map(e => this.whenLine(e, q)).filter(Boolean);
    if (!lines.length) return null;
    return { text: lines.map(l => l.text).join(' '), items: lines.map(l => l.item) };
  }

  whenLine(e, q) {
    const now = this.now;
    const r = e.rec;
    const dated = (title, verb, date, icon) => {
      const past = date < this.today;
      const v = past ? { expires: 'expired', renews: 'renewed', 'is due': 'was due' }[verb] || verb : verb;
      return { text: `${title} ${v} ${longDate(date, now)} (${relative(date, now)}).`, item: { title, detail: `${cap(v)} ${longDate(date, now)}`, icon } };
    };
    if (e.kind === 'doc') {
      const owner = this.person(r.owner);
      const title = owner ? (owner.relation === 'me' ? `Your ${DOC_LABEL[r.kind]}` : `${first(owner.name)}'s ${DOC_LABEL[r.kind]}`) : r.title;
      if (!r.expires) return { text: `${title} doesn't expire${r.location ? `. It's kept in ${r.location}` : ''}.`, item: { title, detail: r.location || 'Vault', icon: 'doc' } };
      const out = dated(title, 'expires', r.expires, 'doc');
      if (r.location) out.text += ` The original is in ${r.location}.`;
      return out;
    }
    if (e.kind === 'policy') {
      const out = dated(`Your ${r.label.toLowerCase()} insurance with ${r.carrier}`, 'renews', r.renews, 'doc');
      out.text += ` The premium is ${money(r.premium)}/${r.per}.`;
      return out;
    }
    if (e.kind === 'vehicle') {
      if (q.includes('oil')) {
        const next = addDays(r.lastOil, 182);
        return dated(`The ${r.name}'s next oil change`, 'is due', next, 'check');
      }
      return dated(`The ${r.name}'s registration`, 'expires', r.registration, 'doc');
    }
    if (e.kind === 'bill') {
      if (q.includes('trial') && r.trialEnds) {
        return { text: `Your ${r.name} trial ends ${longDate(r.trialEnds, now)} (${relative(r.trialEnds, now)}). After that it's ${money(r.amount)}/mo.`, item: { title: `${r.name} trial`, detail: `Ends ${longDate(r.trialEnds, now)}`, icon: 'hourglass' } };
      }
      return { text: `${r.name} (${money(r.amount)}) is due ${longDate(r.due, now)} (${relative(r.due, now)})${r.autopay ? ' and pays itself' : ''}.`, item: { title: r.name, detail: `${money(r.amount)} due ${longDate(r.due, now)}`, icon: 'card' } };
    }
    if (e.kind === 'person') return this.birthdayLine(r, q);
    if (e.kind === 'task') return dated(r.title, 'is due', r.due, 'check');
    if (e.kind === 'project') return dated(r.title, 'was done', r.date, 'home');
    return null;
  }

  birthdayLine(p, q) {
    const now = this.now;
    const next = nextBirthday(p.birthday, this.today);
    const turning = next.getFullYear() - p.birthday.getFullYear();
    const me = p.relation === 'me';
    const poss = me ? 'Your' : `${first(p.name)}'s`;
    const turns = p.relation === 'pet' ? '' : `, when ${me ? 'you turn' : `${first(p.name)} turns`} ${turning}`;
    const age = hasWord(q, ['how old', 'age']) && p.relation !== 'pet' ? `${me ? 'You are' : `${first(p.name)} is`} ${turning - 1}. ` : '';
    return { text: `${age}${poss} birthday is ${longDate(next, now)} (${relative(next, now)})${turns}.`, item: { title: `${first(p.name)}'s birthday`, detail: longDate(next, now), icon: 'cal' } };
  }

  // When did I last…? -----------------------------------------------------------------------------------------

  lastDone(q) {
    const now = this.now;
    const w = content(q);
    if (q.includes('oil')) {
      const v = this.h.vehicles[0];
      return { text: `The ${v.name}'s last oil change was ${longDate(v.lastOil, now)} (${relative(v.lastOil, now)}) at ${v.lastOilMiles.toLocaleString('en-US')} miles.`, items: [{ title: `${v.name} oil change`, detail: longDate(v.lastOil, now), icon: 'check' }] };
    }
    const task = this.rank(this.h.tasks.filter(t => t.lastDone), t => overlap(w, words(t.title)))[0];
    if (task) return { text: `You last did "${task.title}" ${longDate(task.lastDone, now)} (${relative(task.lastDone, now)}). The next one is ${task.due < this.today ? 'overdue' : `due ${dayInline(task.due, now)}`}.`, items: [{ title: task.title, detail: `Last done ${longDate(task.lastDone, now)}`, icon: 'check' }], follow: [`I changed the ${task.title.includes('filter') ? 'HVAC filter' : low(task.title)}`] };
    const project = this.rank(this.h.projects, h => overlap(w, words(`${h.title} ${h.room}`)))[0];
    if (project) return { text: `${project.title}: ${longDate(project.date, now)} (${relative(project.date, now)}), by ${project.by}${project.cost ? `, ${whole(project.cost)}` : ''}.`, items: [{ title: project.title, detail: project.materials, icon: 'home' }] };
    return null;
  }

  // Money -----------------------------------------------------------------------------------------------------

  spend(q) {
    const w = content(q);
    const yearly = /\b(year|annual|annually)\b/.test(q);
    const named = this.rank(this.h.bills, b => overlap(w, words(b.name)))[0];
    if (named && !has(q, ['subscriptions', 'bills', 'total'])) {
      let text = `${named.name} is ${money(named.amount)} a ${named.every}`;
      if (named.every !== 'year') text += `, about ${whole(named.amount * perYear[named.every])} a year`;
      text += `. Next charge ${dayInline(named.due, this.now)}`;
      if (named.was) text += `. It went up from ${money(named.was)} on ${longDate(named.raised, this.now)}`;
      return { text: `${text}.`, items: [this.billItem(named)] };
    }
    if (q.includes('insurance')) {
      const p = this.rank(this.h.policies, x => overlap(w, words(`${x.label} ${x.carrier} ${x.kind === 'auto' ? 'car' : 'home house'}`)))[0];
      if (p) return { text: `Your ${p.label.toLowerCase()} insurance with ${p.carrier} is ${money(p.premium)}/${p.per}.`, items: [{ title: `${p.label} · ${p.carrier}`, detail: `Renews ${longDate(p.renews, this.now)}`, icon: 'doc' }] };
    }
    const cats = [
      [['streaming', 'stream', 'tv', 'shows', 'movies'], 'streaming', 'streaming'], [['music', 'audio'], 'music', 'music'],
      [['utilities', 'utility', 'power', 'electric', 'water'], 'utilities', 'utilities'], [['internet', 'wifi'], 'internet', 'internet'],
      [['daycare', 'childcare'], 'childcare', 'childcare'], [['mortgage', 'rent', 'housing'], 'housing', 'the mortgage'], [['cloud', 'icloud', 'storage'], 'cloud', 'cloud storage'],
    ].filter(([ws]) => hasWord(q, ws));
    if (cats.length) {
      const [, cat, label] = cats[0];
      const bills = this.h.bills.filter(b => b.category === cat).sort((a, b) => monthly(b) - monthly(a));
      const m = bills.reduce((t, b) => t + monthly(b), 0);
      const total = yearly ? `${whole(m * 12)} a year` : `about ${whole(m)} a month (${whole(m * 12)} a year)`;
      return { text: `You spend ${total} on ${label}: ${list(bills.map(b => `${b.name} ${money(b.amount)}`))}.`, items: bills.map(b => this.billItem(b)) };
    }
    const subs = this.h.bills.filter(b => b.sub);
    const bills = this.h.bills.filter(b => !b.sub);
    const sm = subs.reduce((t, b) => t + monthly(b), 0);
    const bm = bills.reduce((t, b) => t + monthly(b), 0);
    if (q.includes('subscription')) {
      return { text: `${count(subs.length, 'subscription')} cost about ${whole(sm)} a month, ${whole(sm * 12)} a year.`, items: subs.map(b => this.billItem(b)), follow: ['Any price increases?'] };
    }
    return { text: `Bills and subscriptions come to about ${whole(sm + bm)} a month: ${whole(bm)} in bills and ${whole(sm)} in subscriptions.`, items: [...this.h.bills].sort((a, b) => monthly(b) - monthly(a)).slice(0, 5).map(b => this.billItem(b)), follow: ['How much do I spend on streaming?'] };
  }

  billItem(b) { return { title: b.name, detail: `${money(b.amount)}/${b.every === 'week' ? 'wk' : b.every === 'year' ? 'yr' : 'mo'} · next ${dayInline(b.due, this.now)}`, icon: b.sub ? 'repeat' : 'card' }; }

  subscriptions() {
    const subs = this.h.bills.filter(b => b.sub).sort((a, b) => b.amount - a.amount);
    const m = subs.reduce((t, b) => t + monthly(b), 0);
    return { text: `You pay for ${num(subs.length)} subscriptions, about ${whole(m)} a month: ${list(subs.map(b => b.name))}.`, items: subs.map(b => this.billItem(b)), follow: ['Any price increases?'] };
  }

  increases() {
    const raised = this.h.bills.filter(b => b.was);
    if (!raised.length) return { text: 'No price increases on anything I\'m tracking.' };
    const extra = raised.reduce((t, b) => t + (b.amount - b.was) * perYear[b.every], 0);
    return { text: `${list(raised.map(b => `${b.name} went from ${money(b.was)} to ${money(b.amount)}`))}. That's ${whole(extra)} more a year.`, items: raised.map(b => this.billItem(b)) };
  }

  // People, contacts, places ----------------------------------------------------------------------------------

  contact(q) {
    if (!has(q, ['who is', "who's", 'whos', 'number', 'phone', 'call', 'contact', 'claims'])) return null;
    if (has(q, ['claim', 'agent']) || (q.includes('insurance') && has(q, ['number', 'phone', 'call']))) {
      const w = content(q);
      const p = this.rank(this.h.policies, x => overlap(w, words(`${x.label} ${x.carrier} ${x.kind === 'auto' ? 'car' : 'home house'}`)))[0] || this.h.policies[0];
      const parts = [`claims line ${p.claims}`];
      if (p.agent) parts.push(`agent ${p.agent}`);
      return { text: `${p.label} · ${p.carrier}: ${list(parts)}.`, items: [{ title: `${p.label} · ${p.carrier}`, detail: parts.join(' · '), icon: 'doc' }] };
    }
    const roles = { plumber: 'plumber', electrician: 'electrician', pediatrician: 'pediatrician', vet: 'vet', doctor: 'pediatrician' };
    const role = Object.keys(roles).find(r => hasWord(q, [r]));
    let found = role ? this.h.contacts.filter(c => c.role === roles[role]) : [];
    if (!found.length) found = this.rank(this.h.contacts, c => overlap(content(q), words(c.name)));
    if (!found.length) return role ? { text: `I don't have a ${role} saved yet. Add one and I'll have the number ready.` } : null;
    const c = found[0];
    return { text: `Your ${c.role} is ${c.name}, ${c.phone}.${c.note ? ` ${c.note}` : ''}`, items: [{ title: c.name, detail: `${cap(c.role)} · ${c.phone}`, icon: 'phone' }] };
  }

  personQ(q) {
    const p = this.mentioned(q)[0];
    if (!p) return null;
    const me = p.relation === 'me';
    const poss = me ? 'Your' : `${first(p.name)}'s`;
    const subj = me ? 'You' : first(p.name);
    const item = detail => [{ title: p.name, detail, icon: 'lock' }];
    if (q.includes('blood')) return { text: p.bloodType ? `${poss} blood type is ${p.bloodType}.` : `I don't have ${poss.toLowerCase()} blood type.`, items: item(p.bloodType || 'Not saved') };
    if (q.includes('allerg')) return { text: p.allergies ? `${subj} ${me ? 'are' : 'is'} allergic to ${p.allergies}.` : `No allergies saved for ${me ? 'you' : first(p.name)}.`, items: item(p.allergies || 'None saved') };
    if (hasWord(q, ['doctor', 'pediatrician', 'vet'])) return { text: p.doctor ? `${poss} ${p.relation === 'pet' ? 'vet' : 'doctor'} is ${p.doctor}.` : `I don't have ${poss.toLowerCase()} doctor.`, items: item(p.doctor || 'Not saved') };
    if (hasWord(q, ['how old', 'age', 'birthday', 'born'])) { const l = this.birthdayLine(p, q); return { text: l.text, items: [l.item] }; }
    return null;
  }

  where(q) {
    if (!has(q, ['where is', "where's", 'wheres', 'where are', 'where do i keep', 'where did i put', 'where do we keep'])) return null;
    const w = content(q);
    const named = this.mentioned(q)[0];
    const doc = this.rank(this.h.docs, d => {
      const n = overlap(w, words(`${d.title} ${DOC_LABEL[d.kind] || ''}`));
      if (!n) return 0;
      return n * 3 + (named ? (d.owner === named.id ? 3 : -2) : 0);
    })[0];
    if (doc) return { text: doc.location ? `The ${low(doc.title)} original is in ${doc.location}.` : `${doc.title} is saved in Vault, but I don't know where the paper original is.`, items: [{ title: doc.title, detail: doc.location || 'Vault', icon: 'doc' }] };
    return null;
  }

  paint(q) {
    if (!has(q, ['paint', 'color', 'colour'])) return null;
    const p = this.h.projects.find(h => /paint/i.test(h.title));
    return { text: `${p.room}: ${p.materials}, painted ${longDate(p.date, this.now)}.`, items: [{ title: p.title, detail: p.materials, icon: 'home' }] };
  }

  // Everything else -------------------------------------------------------------------------------------------

  search(q) {
    const w = content(q);
    const ranked = this.entities().map(e => ({ e, s: this.score(e, w, q) })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
    if (!ranked.length) return { text: "I couldn't find that in this example household. Try asking what's due, when something expires, what you spend, or tell me something to remember.", follow: ['Brief me', "What's due this week?"] };
    const best = ranked[0].e;
    const line = this.whenLine(best, q);
    if (line) return { text: line.text, items: [line.item] };
    if (best.kind === 'contact') return this.contact(`who is ${best.rec.role} number`);
    return { text: `Here's what I have: ${best.rec.name || best.rec.title}.` };
  }

  help() {
    return { text: "Ask me what's due, when something expires or renews, what you spend, who to call, or when you last did something. Or tell me what to remember.", follow: ['Brief me', "What's due this week?", 'When does my passport expire?'] };
  }
}
