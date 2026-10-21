// The app's own logic, rebuilt for the browser: reads bank and card statement files, finds repeating charges
// (subscriptions, bills, price increases, free trials) and turns a typed sentence into a bill, task or renewal.
// Everything here runs on the visitor's device. Nothing in this file talks to a network.

// ---------------------------------------------------------------------------------------------------------------
// Dates

const DAY = 86400000;

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes());
}

/** Whole calendar days from a to b, ignoring daylight-saving shifts. */
export function daysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/** A date at 9:00 on the same day. */
function atNine(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0);
}

// ---------------------------------------------------------------------------------------------------------------
// How often something repeats

export class Recurrence {
  constructor(every, unit) {
    this.every = Math.max(1, every);
    this.unit = unit; // 'day' | 'week' | 'month' | 'year'
  }

  equals(other) {
    return !!other && other.every === this.every && other.unit === this.unit;
  }

  get label() {
    const { every: n, unit } = this;
    if (n === 1) return { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[unit];
    if (n === 2 && unit === 'week') return 'Every 2 weeks';
    return `Every ${n} ${unit}s`;
  }

  /** "a month", "every 2 weeks", "a year": for sentences like "$17.99 a month". */
  get phrase() {
    const { every: n, unit } = this;
    if (n === 1) return `a ${unit}`;
    if (n === 3 && unit === 'month') return 'a quarter';
    return `every ${n} ${unit}s`;
  }

  get timesPerYear() {
    switch (this.unit) {
      case 'day': return 365 / this.every;
      case 'week': return 52 / this.every;
      case 'month': return 12 / this.every;
      default: return 1 / this.every;
    }
  }

  /** The next date one step after `date`. Monthly dates keep their day of the month where they can. */
  advance(date, preferredDay) {
    const day = preferredDay || date.getDate();
    switch (this.unit) {
      case 'day': return addDays(date, this.every);
      case 'week': return addDays(date, 7 * this.every);
      case 'month': {
        const total = date.getMonth() + this.every;
        const year = date.getFullYear() + Math.floor(total / 12);
        const month = ((total % 12) + 12) % 12;
        return new Date(year, month, Math.min(day, daysInMonth(year, month)), date.getHours(), date.getMinutes());
      }
      default: {
        const year = date.getFullYear() + this.every;
        const month = date.getMonth();
        return new Date(year, month, Math.min(day, daysInMonth(year, month)), date.getHours(), date.getMinutes());
      }
    }
  }
}

Recurrence.daily = new Recurrence(1, 'day');
Recurrence.weekly = new Recurrence(1, 'week');
Recurrence.biweekly = new Recurrence(2, 'week');
Recurrence.monthly = new Recurrence(1, 'month');
Recurrence.quarterly = new Recurrence(3, 'month');
Recurrence.semiannual = new Recurrence(6, 'month');
Recurrence.yearly = new Recurrence(1, 'year');

// ---------------------------------------------------------------------------------------------------------------
// Known subscriptions and billers, with each company's own cancel or manage page (checked October 2026)

const SUBSCRIPTION_LIKE = new Set(['streaming', 'music', 'software', 'cloud', 'news', 'fitness', 'gaming', 'education',
  'membership', 'food', 'shopping']);

export const CATEGORY_LABELS = {
  housing: 'Rent or mortgage', utilities: 'Utilities', insurance: 'Insurance', phone: 'Phone', internet: 'Internet & TV',
  loan: 'Loan', creditCard: 'Credit card', childcare: 'Childcare', transport: 'Car & transport', health: 'Health',
  streaming: 'Streaming', music: 'Music & audio', software: 'Apps & software', cloud: 'Cloud storage',
  news: 'News & reading', fitness: 'Fitness', food: 'Food & delivery', shopping: 'Shopping & memberships',
  gaming: 'Gaming', education: 'Learning', membership: 'Clubs & dues', charity: 'Giving', other: 'Other',
};

function m(key, name, keywords, category, cancelURL, note, extra = {}) {
  return { key, name, keywords, category, cancelURL, note, defaultCadence: extra.cadence || Recurrence.monthly,
    flagSingleCharge: extra.single !== false };
}

export const MERCHANTS = [
  m('netflix', 'Netflix', ['netflix'], 'streaming', 'https://www.netflix.com/cancelplan', 'No Cancel button there means another company bills you (an app store, phone or cable provider). Cancel with them.'),
  m('hulu', 'Hulu', ['hulu'], 'streaming', 'https://help.hulu.com/article/hulu-cancel-hulu-subscription', 'If an app store or another company bills you, cancel with them.'),
  m('disneyplus', 'Disney+', ['disney plus', 'disneyplus', 'disney+', 'disney mobile'], 'streaming', 'https://help.disneyplus.com/article/disneyplus-manage-subscription', 'Part of a bundle or billed by an app store? Cancel where you pay.'),
  m('max', 'HBO Max', ['hbo max', 'hbomax', 'max.com', 'wbd max'], 'streaming', 'https://hbomax.com/subscription', 'Choose Cancel Your Subscription. If Apple, Google, Amazon, Roku or your TV provider bills you, cancel there.'),
  m('paramount', 'Paramount+', ['paramount+', 'paramount plus', 'paramountplus', 'cbs all access', 'showtime'], 'streaming', 'https://help.paramountplus.com/s/article/PD-How-can-I-cancel-my-Paramount-subscription', 'If an app store or TV provider bills you, cancel there.'),
  m('peacock', 'Peacock', ['peacock'], 'streaming', 'https://www.peacocktv.com/account/plans', "Choose Cancel All Subscriptions. If it's missing, someone else bills you."),
  m('youtubetv', 'YouTube TV', ['youtube tv', 'youtubetv'], 'streaming', 'https://tv.youtube.com/cancel', 'Shows on statements as a GOOGLE charge.'),
  m('youtube', 'YouTube Premium', ['youtube premium', 'youtubepremium', 'youtube music', 'google *youtube', 'google youtube', 'youtube'], 'streaming', 'https://www.youtube.com/paid_memberships', 'Shows on statements as a GOOGLE charge. If Apple bills you, cancel in Settings › your name › Subscriptions.'),
  m('primevideo', 'Amazon Prime', ['amazon prime', 'amzn prime', 'prime video', 'primevideo', 'prime membership'], 'shopping', 'https://www.amazon.com/mc', 'Sign in to manage your Prime membership.'),
  m('appletv', 'Apple TV', ['apple tv'], 'streaming', 'https://apps.apple.com/account/subscriptions', 'Cancel in Settings › your name › Subscriptions.'),
  m('sling', 'Sling TV', ['sling.com', 'sling tv', 'slingtv'], 'streaming', 'https://sling.com/my-account', null),
  m('fubo', 'Fubo', ['fubo'], 'streaming', 'https://fubo.tv/subscription', 'The cancel option is at the bottom of the subscription section.'),
  m('philo', 'Philo', ['philo'], 'streaming', 'https://www.philo.com/player/user/account', null),
  m('espn', 'ESPN', ['espn'], 'streaming', 'https://support.espn.com/hc/en-us/articles/40377550796308-Cancelling-Your-ESPN-Select-or-Unlimited-Subscription', 'Part of a Disney+ bundle or billed by an app store? Cancel there.'),
  m('starz', 'Starz', ['starz'], 'streaming', 'https://support.starz.com/', 'If an app store, Prime Video or Roku bills you, cancel there.'),
  m('amcplus', 'AMC+', ['amc+', 'amc plus', 'amcplus'], 'streaming', 'https://support.amcplus.com/kb/guide/en/how-do-i-cancel-amc-iIPM4dreK2/Steps/3763641', null),
  m('crunchyroll', 'Crunchyroll', ['crunchyroll'], 'streaming', 'https://www.crunchyroll.com/account/membership', null),
  m('discoveryplus', 'discovery+', ['discovery+', 'discovery plus', 'discoveryplus'], 'streaming', 'https://auth.discoveryplus.com/my-account', null),
  m('spotify', 'Spotify', ['spotify'], 'music', 'https://www.spotify.com/account/subscription/manage/', 'No cancel option there means your phone or internet provider bills you.'),
  m('applemusic', 'Apple Music', ['apple music'], 'music', 'https://apps.apple.com/account/subscriptions', 'Cancel in Settings › your name › Subscriptions.'),
  m('siriusxm', 'SiriusXM', ['siriusxm', 'sirius xm', 'sirius radio', 'sxm '], 'music', 'https://care.siriusxm.com/account/manage/dashboard', 'You can also cancel by chat or phone.'),
  m('pandora', 'Pandora', ['pandora*', 'pandora media', 'pandora.com'], 'music', 'https://www.pandora.com/settings/subscription', null),
  m('tidal', 'Tidal', ['tidal.com', 'tidal music'], 'music', 'https://account.tidal.com/', null),
  m('amazonmusic', 'Amazon Music Unlimited', ['amazon music', 'amzn music', 'music unlimited'], 'music', 'https://www.amazon.com/yourmembershipsandsubscriptions', null),
  m('audible', 'Audible', ['audible'], 'news', 'https://help.audible.com/s/article/before-you-cancel-your-audible-membership?language=en_US', 'Use any credits before you cancel; they go away with the membership.'),
  m('kindleunlimited', 'Kindle Unlimited', ['kindle unltd', 'kindle unlimited', 'kindle svcs'], 'news', 'https://www.amazon.com/kindle-dbs/ku/ku-central', null),
  m('apple', 'Apple subscription', ['apple.com/bill', 'apple.com bill', 'itunes.com', 'apple one', 'icloud'], 'software', 'https://apps.apple.com/account/subscriptions', 'Apple bills App Store apps, iCloud+, Apple TV, Music, Arcade, Fitness+ and Apple One this way. Cancel in Settings › your name › Subscriptions.'),
  m('googleone', 'Google One', ['google one', 'google *google one', 'google storage'], 'cloud', 'https://support.google.com/googleone/answer/6374282', null),
  m('googleplay', 'Google Play subscription', ['google *google play', 'google play', 'google *'], 'software', 'https://play.google.com/store/account/subscriptions', "Deleting an app doesn't cancel its subscription."),
  m('microsoft365', 'Microsoft 365', ['microsoft 365', 'msft *', 'office 365', 'microsoft*365'], 'software', 'https://account.microsoft.com/services', null),
  m('xbox', 'Xbox Game Pass', ['xbox', 'game pass', 'microsoft*ultimate', 'microsoft*xbox'], 'gaming', 'https://account.microsoft.com/services', null),
  m('adobe', 'Adobe', ['adobe'], 'software', 'https://account.adobe.com/plans', 'Annual plans paid monthly can carry an early-cancellation fee. Most plans refund in full within 14 days.'),
  m('dropbox', 'Dropbox', ['dropbox'], 'cloud', 'https://help.dropbox.com/plans/downgrade-dropbox-individual-plans', null),
  m('canva', 'Canva', ['canva*', 'canva.com', 'canva pty'], 'software', 'https://www.canva.com/help/cancel-canva-plan/', null),
  m('zoom', 'Zoom', ['zoom.us', 'zoom video', 'zoom.com'], 'software', 'https://zoom.us/billing', 'Cancel add-ons first, then the plan.'),
  m('openai', 'ChatGPT', ['openai', 'chatgpt'], 'software', 'https://help.openai.com/en/articles/7232927-canceling-your-chatgpt-subscription', null),
  m('anthropic', 'Claude', ['anthropic', 'claude.ai'], 'software', 'https://claude.ai/settings/billing', null),
  m('grammarly', 'Grammarly', ['grammarly'], 'software', 'https://account.grammarly.com/subscription', null),
  m('linkedin', 'LinkedIn Premium', ['linkedin pre', 'linkedin'], 'software', 'https://www.linkedin.com/premium/manage/', null),
  m('norton', 'Norton', ['norton *', 'nortonlifelock', 'gen digital'], 'software', 'https://my.norton.com/account/home', 'Turn off automatic renewal here.'),
  m('mcafee', 'McAfee', ['mcafee'], 'software', 'https://www.mcafee.com/en-us/consumer-support.html', null),
  m('experian', 'Experian', ['experian'], 'software', 'https://usa.experian.com/login/index?br=exp&refUrl=%2Fmfe%2Fmember%2Fngx-profile%2Fmembership-details', 'Switching to the free membership stops the monthly charge.'),
  m('playstation', 'PlayStation Plus', ['playstation', 'sony interactive'], 'gaming', 'https://www.playstation.com/acct/management', null),
  m('nintendo', 'Nintendo Switch Online', ['nintendo'], 'gaming', 'https://www.nintendo.com/us/switch/online/', 'Turn off automatic renewal under Your Subscriptions in your Nintendo Account.'),
  m('duolingo', 'Duolingo', ['duolingo'], 'education', 'https://www.duolingo.com/settings/subscription', null),
  m('headspace', 'Headspace', ['headspace'], 'fitness', 'https://www.headspace.com/subscription/manage', 'Cancel in a web browser, not the app.'),
  m('calm', 'Calm', ['calm.com'], 'fitness', 'https://www.calm.com/profile/manage-subscription', null),
  m('peloton', 'Peloton', ['peloton'], 'fitness', 'https://www.onepeloton.com/mymembership', null),
  m('planetfitness', 'Planet Fitness', ['planet fitness', 'planetfitness', 'planet fit'], 'fitness', 'https://www.planetfitness.com/about-planet-fitness/customer-service', 'Cancel online, at your home club, or by mail before your billing date. Ending a minimum term early can cost a fee.'),
  m('noom', 'Noom', ['noom'], 'fitness', 'https://www.noom.com/support/faqs/', null),
  m('weightwatchers', 'WW (WeightWatchers)', ['weightwatchers', 'weight watchers', 'ww intl'], 'fitness', 'https://www.weightwatchers.com/us/faq', null),
  m('applefitness', 'Apple Fitness+', ['fitness+'], 'fitness', 'https://apps.apple.com/account/subscriptions', null),
  m('dashpass', 'DashPass', ['dashpass'], 'food', 'https://help.doordash.com/en-us/consumers/article/how-do-i-cancel-my-dashpass-subscription', 'Cancel at least a day before it renews.'),
  m('uberone', 'Uber One', ['uber *one', 'uber one', 'uberone'], 'food', 'https://www.uber.com/us/en/u/uber-one/', 'Cancel in the Uber app: Uber One › Manage Membership › End Membership.'),
  m('instacart', 'Instacart+', ['instacart+', 'instacart subscription', 'instacart membership'], 'food', 'https://www.instacart.com/store/account/instacart-plus', null),
  m('shipt', 'Shipt', ['shipt'], 'food', 'https://help.shipt.com/account/how-do-i-cancel-my-membership', null),
  m('krogerboost', 'Kroger Boost', ['kroger boost'], 'shopping', 'https://www.kroger.com/membership', null),
  m('walmartplus', 'Walmart+', ['wmt plus', 'walmart+', 'walmart plus', 'walmartplus'], 'shopping', 'https://www.walmart.com/plus/faq', null),
  m('costco', 'Costco membership', ['costco *annual', 'costco annual', 'costco membership'], 'shopping', 'https://www.costco.com/member-privileges-conditions.html', 'Turn off auto-renewal at least 3 days before your renewal month.', { cadence: Recurrence.yearly }),
  m('samsclub', "Sam's Club membership", ['sams club member', 'sams membership', 'samsclub member', "sam's club membership"], 'shopping', 'https://help.samsclub.com/app/answers/detail/a_id/4075', null, { cadence: Recurrence.yearly }),
  m('hellofresh', 'HelloFresh', ['hellofresh', 'hello fresh'], 'food', 'https://www.hellofresh.com/faq', 'Cancel at least 5 days before your next delivery.', { cadence: Recurrence.weekly }),
  m('factor', 'Factor', ['factor75', 'factor 75'], 'food', 'https://www.factor75.com/about/faq', null, { cadence: Recurrence.weekly }),
  m('blueapron', 'Blue Apron', ['blue apron', 'blueapron'], 'food', 'https://support.blueapron.com/hc/en-us', null, { cadence: Recurrence.weekly }),
  m('chewy', 'Chewy Autoship', ['chewy'], 'shopping', 'https://www.chewy.com/app/content/autoship', 'Autoship charges look like regular Chewy orders.', { single: false }),
  m('barkbox', 'BarkBox', ['barkbox', 'bark box', 'bark.co'], 'shopping', 'https://bark.co/account', null),
  m('dollarshave', 'Dollar Shave Club', ['dollar shave', 'dollarshaveclub'], 'shopping', 'https://us.dollarshaveclub.com/account', 'Each product is its own subscription; cancel each one.'),
  m('nytimes', 'New York Times', ['nytimes', 'ny times', 'new york times'], 'news', 'https://myaccount.nytimes.com/seg/subscription', null),
  m('wsj', 'Wall Street Journal', ['wsj', 'dow jones', 'wall st journal', 'wall street journal'], 'news', 'https://customercenter.wsj.com/', null),
  m('washpost', 'Washington Post', ['washington post', 'washpost'], 'news', 'https://www.washingtonpost.com/my-post/account/subscription/', null),
  m('patreon', 'Patreon', ['patreon'], 'membership', 'https://www.patreon.com/settings/memberships', 'Cancel each creator separately.'),
  m('ring', 'Ring', ['ring.com', 'ring protect', 'ring llc', 'ring yearly', 'ring monthly'], 'software', 'https://ring.com/support/articles/468y0/Canceling-your-Ring-plan', 'Download any videos you want to keep first.'),
  m('simplisafe', 'SimpliSafe', ['simplisafe'], 'software', 'https://support.simplisafe.com/articles/account-billing/how-do-i-change-my-monitoring-plan', 'Most people cancel by phone or chat.'),
  m('adt', 'ADT', [' adt '], 'utilities', null, 'ADT contracts can carry early termination fees. Check your agreement first.', { single: false }),
  m('life360', 'Life360', ['life360'], 'software', 'https://support.life360.com/hc/en-us/articles/23053539274135-Cancel-My-Membership', null),
  m('ancestry', 'Ancestry', ['ancestry'], 'membership', 'https://www.ancestry.com/account?language=en_US', null),
  m('match', 'Match', ['match.com', 'matchcom'], 'membership', 'https://help.match.com/hc/en-us/articles/6077124196891-Canceling-a-Match-Subscription', null),
  m('tinder', 'Tinder', ['tinder'], 'membership', 'https://tinder.com/faq/', null),
  m('bumble', 'Bumble', ['bumble'], 'membership', 'https://support.bumble.com/hc/en-us/articles/28534541366045-Canceling-subscriptions', null),
  m('rocketmoney', 'Rocket Money', ['rocket money', 'rocketmoney', 'truebill'], 'software', 'https://help.rocketmoney.com/en/articles/9095189-managing-my-premium-membership', null),
  m('xfinity', 'Xfinity', ['comcast', 'xfinity'], 'internet', 'https://customer.xfinity.com/', null, { single: false }),
  m('spectrum', 'Spectrum', ['spectrum', 'charter comm'], 'internet', 'https://www.spectrum.net/', null, { single: false }),
  m('att', 'AT&T', ['at&t', 'att*bill', 'att bill'], 'phone', 'https://www.att.com/my/', null, { single: false }),
  m('verizon', 'Verizon', ['verizon', 'vzwrlss', 'vz wireless'], 'phone', 'https://www.verizon.com/my-verizon/', null, { single: false }),
  m('tmobile', 'T-Mobile', ['t-mobile', 'tmobile'], 'phone', 'https://my.t-mobile.com/', null, { single: false }),
];

export function isSubscriptionLike(category) {
  return SUBSCRIPTION_LIKE.has(category);
}

/** Matches ordinary text ("netflix trial ends friday"). */
export function matchMerchant(text) {
  const lower = ' ' + text.toLowerCase() + ' ';
  return MERCHANTS.find(mr => mr.keywords.some(k => lower.includes(k))) || null;
}

/** Matches statement text, which tends to be uppercase and squashed ("NETFLIX.COM", "SPOTIFYUSA"). */
export function matchStatement(description) {
  const lower = ' ' + description.toLowerCase() + ' ';
  const squashed = lower.replace(/[^\p{L}\p{N} +*./]/gu, '');
  return MERCHANTS.find(mr => mr.keywords.some(k => lower.includes(k) || squashed.includes(k))) || null;
}

// ---------------------------------------------------------------------------------------------------------------
// Values

/** Turns "1.234,56", "1,234.56", "17,99" and "1,234" into plain "1234.56" / "17.99" / "1234". */
export function normalizeSeparators(input) {
  let text = input;
  const commas = (text.match(/,/g) || []).length;
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(/,/g, '.') : text.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const decimals = text.length - lastComma - 1;
    text = commas === 1 && decimals === 2 ? text.replace(/,/g, '.') : text.replace(/,/g, '');
  }
  return text;
}

/** Money in a statement cell, as whole cents (negative for credits in signed columns). Null when it isn't money. */
export function parseAmount(raw) {
  if (raw == null) return null;
  let text = String(raw).trim();
  if (!text) return null;
  let negative = false;
  if (text.startsWith('(') && text.endsWith(')')) { negative = true; text = text.slice(1, -1); }
  if (text.endsWith('-')) { negative = true; text = text.slice(0, -1); }
  if (text.endsWith(' CR') || text.endsWith('CR')) { negative = !negative; text = text.replace(/CR/g, ''); }
  if (text.startsWith('-')) { negative = !negative; text = text.slice(1); }
  for (const marker of ['$', '€', '£', 'USD', 'EUR', 'GBP', ' ', ' ']) text = text.split(marker).join('');
  text = normalizeSeparators(text);
  if (text.startsWith('-')) { negative = !negative; text = text.slice(1); }
  if (!text || !/^[0-9.]+$/.test(text) || (text.match(/\./g) || []).length > 1 || text === '.') return null;
  const cents = Math.round(parseFloat(text) * 100);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function monthIndex(word) {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return -1;
  const i = MONTHS.indexOf(w.slice(0, 3));
  if (i < 0) return -1;
  const full = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
    'november', 'december'][i];
  // "Sept" is common on statements.
  return full.startsWith(w) || w === 'sept' ? i : -1;
}

function makeDate(year, month, day) {
  if (year < 100) year += 2000;
  if (year < 2000 || year > 2100 || month < 0 || month > 11 || day < 1 || day > daysInMonth(year, month)) return null;
  return new Date(year, month, day);
}

/** Whether the visitor's region writes the day first (03/04/2026 meaning 3 April). */
export function localeDayFirst() {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(2026, 0, 31));
    const order = parts.filter(p => p.type === 'day' || p.type === 'month').map(p => p.type);
    return order[0] === 'day';
  } catch (e) {
    return false;
  }
}

/** Looks at a column of dates written like 03/04/2026 and decides whether the day or the month comes first. */
export function detectDayFirst(values, fallback = localeDayFirst()) {
  let dayFirstVotes = 0;
  let monthFirstVotes = 0;
  for (const value of values) {
    const match = /^\s*(\d{1,2})[/-](\d{1,2})[/-]\d{2,4}/.exec(value || '');
    if (!match) continue;
    const a = +match[1];
    const b = +match[2];
    if (a > 12 && b <= 12) dayFirstVotes++;
    if (b > 12 && a <= 12) monthFirstVotes++;
  }
  if (dayFirstVotes > monthFirstVotes) return true;
  if (monthFirstVotes > dayFirstVotes) return false;
  return fallback;
}

/** A statement date, or null. Understands the formats banks use most. */
export function parseDate(raw, dayFirst = false) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text.length < 6 || text.length > 24 || !/^[0-9A-Za-z]/.test(text)) return null;
  let match;
  // 10/03/2026, 10-03-26, with or without a time after it
  if ((match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4}|\d{2})(?:[ T].*)?$/.exec(text))) {
    const a = +match[1], b = +match[2], y = +match[3];
    return dayFirst ? makeDate(y, b - 1, a) : makeDate(y, a - 1, b);
  }
  // 2026-10-03, 2026/10/03, 2026-10-03T12:00:00
  if ((match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$/.exec(text))) return makeDate(+match[1], +match[2] - 1, +match[3]);
  // 03.10.2026
  if ((match = /^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})$/.exec(text))) return makeDate(+match[3], +match[2] - 1, +match[1]);
  // 20261003
  if ((match = /^(\d{4})(\d{2})(\d{2})$/.exec(text))) return makeDate(+match[1], +match[2] - 1, +match[3]);
  // Oct 3, 2026 / October 3 2026
  if ((match = /^([A-Za-z]{3,9}\.?)\s+(\d{1,2}),?\s+(\d{4})$/.exec(text))) {
    const mi = monthIndex(match[1]);
    return mi < 0 ? null : makeDate(+match[3], mi, +match[2]);
  }
  // 3 Oct 2026
  if ((match = /^(\d{1,2})\s+([A-Za-z]{3,9}\.?),?\s+(\d{4})$/.exec(text))) {
    const mi = monthIndex(match[2]);
    return mi < 0 ? null : makeDate(+match[3], mi, +match[1]);
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Reading statement files

export class StatementError extends Error {}

export const STATEMENT_ERRORS = {
  noTransactions: 'No transactions were found in that file. Most banks offer a CSV download under Statements or Activity, which works best.',
  pdf: 'PDF statements are read in the app. Here, use the CSV or Quicken (OFX/QFX) download from your bank.',
  unreadable: "That file couldn't be read. Try downloading the statement again as a CSV.",
};

/** Reads a whole statement file's text. Returns transactions sorted oldest first. */
export function readStatement(text, fileName = '') {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (text.startsWith('%PDF') || ext === 'pdf') throw new StatementError(STATEMENT_ERRORS.pdf);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const isOFX = ext === 'ofx' || ext === 'qfx' || text.includes('<OFX>') || text.includes('<STMTTRN>');
  const result = isOFX ? parseOFX(text) : parseCSV(text);
  if (!result.length) throw new StatementError(STATEMENT_ERRORS.noTransactions);
  return result.sort((a, b) => a.date - b.date);
}

function detectDelimiter(text) {
  const sample = text.split('\n').slice(0, 10).join('\n');
  const counts = [[',', (sample.match(/,/g) || []).length], [';', (sample.match(/;/g) || []).length],
    ['\t', (sample.match(/\t/g) || []).length]];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** Splits CSV text into rows, respecting quoted fields. */
export function csvRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = '';
    } else if (ch === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function parseCSV(text) {
  const delimiter = detectDelimiter(text);
  const rows = csvRows(text, delimiter).filter(row => row.some(cell => cell.trim()));
  if (!rows.length) return [];

  // Find the header row (some banks put account details above it).
  let headerIndex = -1;
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const lower = rows[i].map(c => c.toLowerCase().trim());
    const hasDate = lower.some(c => c.includes('date'));
    const hasMoney = lower.some(c => c.includes('amount') || c.includes('debit') || c.includes('withdrawal') || c === 'charge' || c.includes('credit'));
    if (hasDate && hasMoney) { headerIndex = i; break; }
  }
  if (headerIndex < 0) return parseHeaderless(rows);
  const header = rows[headerIndex].map(c => c.toLowerCase().trim());

  const column = (candidates, exact = false) => {
    for (const candidate of candidates) {
      const index = header.findIndex(h => (exact ? h === candidate : h.includes(candidate)));
      if (index >= 0) return index;
    }
    return -1;
  };
  let dateCol = column(['transaction date', 'trans date', 'trans. date', 'date']);
  if (dateCol < 0) dateCol = column(['posted', 'posting']);
  let descCol = column(['merchant'], true);
  if (descCol < 0) descCol = column(['description', 'payee', 'merchant', 'name', 'details', 'narrative', 'memo', 'transaction']);
  const amountCol = column(['amount']);
  const debitCol = column(['debit', 'withdrawal', 'money out', 'charges', 'charge', 'outflow']);
  const creditCol = column(['credit', 'deposit', 'money in', 'payments', 'inflow']);
  const typeCol = column(['transaction type', 'type']);
  if (dateCol < 0 || descCol < 0 || (amountCol < 0 && debitCol < 0)) return parseHeaderless(rows);

  const body = rows.slice(headerIndex + 1);
  const dayFirst = detectDayFirst(body.map(r => r[dateCol]));
  const parsed = [];
  for (const row of body) {
    if (row.length <= Math.max(dateCol, descCol)) continue;
    const date = parseDate(row[dateCol], dayFirst);
    if (!date) continue;
    const desc = row[descCol].trim();
    const typeText = typeCol >= 0 && typeCol < row.length ? row[typeCol].toLowerCase() : '';
    const debit = debitCol >= 0 && debitCol < row.length ? parseAmount(row[debitCol]) : null;
    const credit = creditCol >= 0 && creditCol < row.length ? parseAmount(row[creditCol]) : null;
    const amount = amountCol >= 0 && amountCol < row.length ? parseAmount(row[amountCol]) : null;
    if (debit != null && debit !== 0) {
      parsed.push({ date, desc, signed: Math.abs(debit), typeText, explicit: false });
    } else if (credit != null && credit !== 0 && amountCol < 0) {
      parsed.push({ date, desc, signed: Math.abs(credit), typeText, explicit: true });
    } else if (amount != null) {
      parsed.push({ date, desc, signed: amount, typeText, explicit: null });
    }
  }

  // With one signed amount column, most rows are purchases: whichever sign is more common means "money out".
  const signedRows = parsed.filter(r => r.explicit === null);
  const negatives = signedRows.filter(r => r.signed < 0).length;
  const chargesAreNegative = negatives * 2 >= signedRows.length;
  const creditWords = ['payment', 'credit', 'refund', 'return', 'deposit', 'reversal', 'cashback', 'cash back'];

  return parsed.map(r => {
    let isCredit = r.explicit !== null ? r.explicit : (chargesAreNegative ? r.signed > 0 : r.signed < 0);
    if (creditWords.some(w => r.typeText.includes(w))) isCredit = true;
    if (r.typeText.includes('purchase') || r.typeText.includes('sale') || r.typeText.includes('debit')) isCredit = false;
    return { date: r.date, description: r.desc, amount: Math.abs(r.signed), isCredit };
  });
}

/** For CSVs with no header row: the first date, the longest text and the first money value on each line. */
function parseHeaderless(rows) {
  const dayFirst = detectDayFirst(rows.map(r => r.find(c => /^\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(c)) || ''));
  const signed = [];
  let negatives = 0;
  for (const row of rows) {
    const date = row.map(c => parseDate(c, dayFirst)).find(Boolean);
    if (!date) continue;
    const amountCell = row.find(c => c.includes('.') && parseAmount(c) != null);
    const amount = amountCell != null ? parseAmount(amountCell) : null;
    const texts = row.filter(c => parseAmount(c) == null && parseDate(c, dayFirst) == null);
    const desc = texts.reduce((best, c) => (c.length > best.length ? c : best), '');
    if (amount == null || !desc.trim()) continue;
    if (amount < 0) negatives++;
    signed.push({ date, desc: desc.trim(), amount });
  }
  const chargesAreNegative = negatives * 2 >= signed.length;
  return signed.map(r => ({ date: r.date, description: r.desc, amount: Math.abs(r.amount),
    isCredit: chargesAreNegative ? r.amount > 0 : r.amount < 0 }));
}

function ofxValue(tag, body) {
  const start = body.indexOf(`<${tag}>`);
  if (start < 0) return null;
  const rest = body.slice(start + tag.length + 2);
  const end = rest.search(/[<\n\r]/);
  const value = (end < 0 ? rest : rest.slice(0, end)).trim();
  return value ? value.replace(/&amp;/g, '&') : null;
}

export function parseOFX(text) {
  const result = [];
  const blocks = text.split('<STMTTRN>').slice(1);
  for (const block of blocks) {
    const body = block.split('</STMTTRN>')[0];
    const posted = ofxValue('DTPOSTED', body);
    const amountText = ofxValue('TRNAMT', body);
    const amount = amountText != null ? parseAmount(amountText) : null;
    if (!posted || amount == null) continue;
    const date = parseDate(posted.slice(0, 8));
    if (!date) continue;
    const name = ofxValue('NAME', body) || '';
    const memo = ofxValue('MEMO', body) || '';
    result.push({ date, description: name || memo, amount: Math.abs(amount), isCredit: amount > 0 });
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// Finding repeating charges

const STOPWORDS = new Set(['OF', 'THE', 'AND', 'INC', 'LLC', 'CO', 'CORP', 'USA', 'US', 'NA']);

export function cleanDescription(description) {
  let text = ' ' + description.toUpperCase() + ' ';
  const prefixes = ['POS DEBIT', 'POS PURCHASE', 'POS ', 'DEBIT CARD PURCHASE', 'DEBIT PURCHASE', 'CARD PURCHASE',
    'CHECKCARD', 'CHECK CARD', 'RECURRING PAYMENT', 'RECURRING DEBIT', 'RECURRING', 'PREAUTHORIZED DEBIT',
    'ACH DEBIT', 'ACH WITHDRAWAL', 'ACH ', 'ONLINE PAYMENT', 'ONLINE PMT', 'ELECTRONIC PAYMENT',
    'BILL PAYMENT', 'BILL PAY', 'AUTOPAY', 'AUTO PAY', 'PURCHASE AUTHORIZED ON', 'PURCHASE', 'PAYMENT TO',
    'WEB PMTS', 'WEB PMT', 'PPD ID:', 'WEB ID:', 'SQ *', 'SQ*', 'TST* ', 'TST*', 'SP * ', 'SP *', 'PP*',
    'PAYPAL *', 'PAYPAL*', 'IN *', 'DD *', 'AMZN MKTP US*', 'AMZN MKTP'];
  for (const prefix of prefixes) text = text.split(' ' + prefix).join(' ');
  const patterns = [/X{2,}\d+/g, /#\s?\d+/g, /\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, /\b\d{3}[-. ]\d{3}[-. ]\d{4}\b/g,
    /\b\d{3,}\b/g, /\.(COM|NET|ORG|CO|IO|TV)\b/g, /\bWWW\./g, /\*/g, /\b[A-Z]{2}\s*$/g];
  for (const pattern of patterns) text = text.replace(pattern, ' ');
  text = text.replace(/[^A-Z& +]/g, ' ').replace(/\s+/g, ' ').trim();
  return text;
}

/** A stable key for grouping charges from the same merchant. */
export function groupKey(description) {
  const merchant = matchStatement(description);
  if (merchant) return 'M:' + merchant.key;
  const words = cleanDescription(description).split(' ').filter(w => (w.length > 1 || w === '&') && !STOPWORDS.has(w));
  return words.slice(0, 2).join(' ');
}

const EVERYDAY = ['KROGER', 'PUBLIX', 'WALMART', 'WAL MART', 'WM SUPERCENTER', 'TARGET', 'ALDI', 'COSTCO WHSE', 'COSTCO GAS',
  'SAMS CLUB', 'SAMSCLUB', 'FOOD LION', 'INGLES', 'WINN DIXIE', 'PIGGLY', 'HARRIS TEETER', 'WHOLE FOODS',
  'TRADER JOE', 'SAFEWAY', 'SPROUTS', 'DOLLAR GENERAL', 'DOLLAR TREE', 'FAMILY DOLLAR', 'CVS', 'WALGREENS',
  'SHELL', 'EXXON', 'CHEVRON', 'BP ', 'QT ', 'QUIKTRIP', 'RACETRAC', 'CIRCLE K', 'MARATHON', 'SUNOCO',
  'SPEEDWAY', 'WAWA', 'SHEETZ', 'MURPHY', 'LOVES', 'PILOT', 'STARBUCKS', 'DUNKIN', 'MCDONALD', 'CHICK FIL',
  'WAFFLE HOUSE', 'SUBWAY', 'WENDY', 'TACO BELL', 'ZAXBY', 'SONIC', 'DOMINO', 'PIZZA HUT', 'AMZN MKTP',
  'AMAZON COM', 'AMAZON MKTPL', 'AMAZON', 'HOME DEPOT', 'LOWES', 'TRACTOR SUPPLY', 'ACE HARDWARE',
  'DOORDASH', 'UBER EATS', 'UBER TRIP', 'UBER', 'LYFT', 'VENMO', 'ZELLE', 'CASH APP', 'ATM', 'TRANSFER'];

/** Stores where people shop all the time. Regular trips there aren't subscriptions. */
export function isEverydaySpending(key) {
  if (key.startsWith('M:')) return false;
  const padded = key + ' ';
  return EVERYDAY.some(name => padded.startsWith(name) || padded.includes(' ' + name));
}

const ACRONYMS = new Set(['YMCA', 'YWCA', 'USAA', 'AARP', 'GEICO', 'AT&T', 'HOA', 'CVS', 'UPS', 'IRS', 'DMV', 'TV',
  'GA', 'FL', 'NY', 'CA', 'TX', 'LA', 'NJ', 'SC', 'NC', 'AL', 'TN']);

export function displayName(key) {
  const raw = key.startsWith('M:') ? key.slice(2) : key;
  return raw.split(' ').filter(Boolean).map(word => {
    const vowels = (word.match(/[AEIOUY]/g) || []).length;
    if (ACRONYMS.has(word) || (word.length <= 4 && vowels === 0)) return word;
    return word[0] + word.slice(1).toLowerCase();
  }).join(' ');
}

function isLikelyBiller(key) {
  const words = ['POWER', 'ELECTRIC', 'ENERGY', 'WATER', 'GAS', 'UTILIT', 'INSURANCE', 'INS ', 'MUTUAL', 'WIRELESS', 'MOBILE',
    'VERIZON', 'AT&T', 'T MOBILE', 'COMCAST', 'XFINITY', 'SPECTRUM', 'INTERNET', 'FIBER', 'MORTGAGE', 'LOAN',
    'LENDING', 'AUTO PAY', 'RENT', 'HOA', 'DAYCARE', 'SCHOOL', 'TUITION', 'GYM', 'FITNESS', 'CLUB'];
  return words.some(w => key.includes(w));
}

function guessCategory(key) {
  const map = [
    ['utilities', ['POWER', 'ELECTRIC', 'ENERGY', 'WATER', 'GAS CO', 'NATURAL GAS', 'UTILIT', 'SEWER', 'WASTE']],
    ['insurance', ['INSURANCE', 'INS ', 'MUTUAL', 'ASSURANCE', 'STATE FARM', 'GEICO', 'PROGRESSIVE', 'ALLSTATE']],
    ['phone', ['WIRELESS', 'MOBILE', 'VERIZON', 'AT&T', 'T MOBILE', 'CRICKET', 'VISIBLE', 'MINT']],
    ['internet', ['COMCAST', 'XFINITY', 'SPECTRUM', 'INTERNET', 'FIBER', 'BROADBAND', 'COX', 'STARLINK']],
    ['housing', ['MORTGAGE', 'RENT', 'HOA', 'PROPERTY']],
    ['loan', ['LOAN', 'LENDING', 'FINANCE', 'AUTO PAY', 'CAPITAL ONE AUTO', 'NAVIENT', 'NELNET', 'MOHELA']],
    ['childcare', ['DAYCARE', 'CHILD', 'LEARNING CENTER', 'ACADEMY', 'MONTESSORI']],
    ['fitness', ['GYM', 'FITNESS', 'YOGA', 'CROSSFIT', 'YMCA', 'PILATES', 'MARTIAL']],
    ['software', ['SOFTWARE', 'APP', 'CLOUD']],
  ];
  for (const [category, words] of map) if (words.some(w => key.includes(w))) return category;
  return 'other';
}

/** Billers that charge for many unrelated subscriptions under one statement name. */
const MULTI_PRODUCT = new Set(['M:apple', 'M:googleplay']);

/** Splits charges into groups of the same price (within 2%), oldest first within each group. */
export function clustersByAmount(transactions) {
  const clusters = [];
  for (const t of transactions) {
    const match = clusters.find(cluster => {
      const reference = cluster[cluster.length - 1].amount;
      return Math.abs(t.amount - reference) <= Math.max(reference * 0.02, 1);
    });
    if (match) match.push(t); else clusters.push([t]);
  }
  return clusters;
}

export function cadenceForDays(days) {
  if (days >= 6 && days <= 8) return Recurrence.weekly;
  if (days >= 13 && days <= 16) return Recurrence.biweekly;
  if (days >= 26 && days <= 35) return Recurrence.monthly;
  if (days >= 56 && days <= 66) return new Recurrence(2, 'month');
  if (days >= 84 && days <= 98) return Recurrence.quarterly;
  if (days >= 170 && days <= 195) return Recurrence.semiannual;
  if (days >= 345 && days <= 385) return Recurrence.yearly;
  return null;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function makeCharge(fields) {
  const charge = { previousAmount: null, seenOnce: false, ...fields };
  charge.monthlyCost = Math.round(charge.amount * charge.cadence.timesPerYear / 12);
  charge.yearlyCost = Math.round(charge.amount * charge.cadence.timesPerYear);
  charge.hasPriceIncrease = charge.previousAmount != null && charge.amount > charge.previousAmount;
  charge.lastDate = charge.dates[charge.dates.length - 1];
  return charge;
}

/** When the next charge should land, after today. */
export function nextExpected(charge, today = new Date()) {
  let next = charge.cadence.advance(charge.lastDate, charge.lastDate.getDate());
  const floor = startOfDay(today);
  for (let guard = 0; next < floor && guard < 400; guard++) next = charge.cadence.advance(next, charge.lastDate.getDate());
  return next;
}

function evaluate(key, transactions, merchant) {
  const dates = transactions.map(t => t.date);
  const amounts = transactions.map(t => t.amount);
  const name = merchant ? merchant.name : displayName(key);
  const category = merchant ? merchant.category : guessCategory(key);
  const knownBiller = !!merchant || isLikelyBiller(key);

  // A known subscription seen once in a short statement is still worth showing.
  if (transactions.length === 1) {
    if (!merchant || !isSubscriptionLike(merchant.category) || !merchant.flagSingleCharge || amounts[0] < 99) return null;
    return makeCharge({ name, groupKey: key, merchantKey: merchant.key, category, isSubscription: true, amount: amounts[0],
      cadence: merchant.defaultCadence, dates, amounts, confidence: 0.45, cancelURL: merchant.cancelURL,
      cancelNote: merchant.note, seenOnce: true });
  }

  // Several charges on the same day are usually separate purchases, not a pattern.
  const uniqueDays = [];
  const dayAmounts = [];
  dates.forEach((date, i) => {
    if (uniqueDays.length && sameDay(uniqueDays[uniqueDays.length - 1], date)) {
      dayAmounts[dayAmounts.length - 1] += amounts[i];
    } else {
      uniqueDays.push(date);
      dayAmounts.push(amounts[i]);
    }
  });
  if (uniqueDays.length < 2) return null;

  const intervals = uniqueDays.slice(1).map((date, i) => daysBetween(uniqueDays[i], date));
  const medianInterval = median(intervals);
  const cadence = cadenceForDays(medianInterval);
  if (!cadence) return null;

  // Most gaps should be close to the typical gap.
  const tolerance = Math.max(3, medianInterval * 0.22);
  const consistency = intervals.filter(v => Math.abs(v - medianInterval) <= tolerance).length / intervals.length;
  if (consistency < 0.6) return null;

  // Subscriptions charge the same (or nearly); bills like power can vary.
  const mean = dayAmounts.reduce((a, b) => a + b, 0) / dayAmounts.length;
  const spread = mean > 0 ? standardDeviation(dayAmounts) / mean : 1;
  const subscriptionLike = merchant ? isSubscriptionLike(merchant.category) : (spread < 0.04 && mean < 15000);
  if (!knownBiller && spread > 0.12) return null;
  if (knownBiller && spread > 0.4) return null;
  if ((cadence.unit === 'week' || cadence.unit === 'day') && spread > 0.08 && !knownBiller) return null;
  if (mean < 99) return null;

  // A price increase: a steady price, then a higher steady price.
  const latest = dayAmounts[dayAmounts.length - 1];
  let previous = null;
  let runStart = dayAmounts.length - 1;
  while (runStart > 0 && Math.abs(dayAmounts[runStart - 1] - latest) <= latest * 0.02) runStart--;
  if (runStart > 0) {
    const before = dayAmounts.slice(0, runStart);
    const reference = before[before.length - 1];
    const steadyBefore = before.every(v => Math.abs(v - reference) <= reference * 0.02);
    const change = latest - reference;
    if (steadyBefore && change >= 50 && change / Math.max(reference, 1) >= 0.02) previous = reference;
  }

  let confidence = 0.5 + 0.25 * consistency + (spread < 0.04 ? 0.15 : 0) + (merchant ? 0.1 : 0);
  if (uniqueDays.length === 2) confidence -= 0.15;
  confidence = Math.min(1, Math.max(0.2, confidence));

  return makeCharge({ name, groupKey: key, merchantKey: merchant ? merchant.key : null, category,
    isSubscription: subscriptionLike, amount: latest, previousAmount: previous, cadence, dates: uniqueDays,
    amounts: dayAmounts, confidence, cancelURL: merchant ? merchant.cancelURL : null,
    cancelNote: merchant ? merchant.note : null });
}

/** Finds subscriptions, recurring bills, price increases and overlaps in a list of transactions. */
export function analyze(transactions) {
  const debits = transactions.filter(t => !t.isCredit && t.amount > 0);
  const groups = new Map();
  for (const t of debits) {
    const key = groupKey(t.description);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const charges = [];
  for (const [key, group] of groups) {
    if (!key || isEverydaySpending(key)) continue;
    const sorted = [...group].sort((a, b) => a.date - b.date);
    const merchant = matchStatement(sorted[sorted.length - 1].description || key);
    if (MULTI_PRODUCT.has(key)) {
      clustersByAmount(sorted).forEach((cluster, index) => {
        const charge = evaluate(`${key}#${index}`, cluster, merchant);
        if (!charge) return;
        charge.name = `${merchant ? merchant.name : displayName(key)} · ${formatMoney(charge.amount)}`;
        charges.push(charge);
      });
      continue;
    }
    const charge = evaluate(key, sorted, merchant);
    if (charge) charges.push(charge);
  }

  charges.sort((a, b) => (a.isSubscription !== b.isSubscription ? (a.isSubscription ? -1 : 1) : b.monthlyCost - a.monthlyCost));

  const dates = transactions.map(t => t.date);
  const firstDate = dates.length ? new Date(Math.min(...dates)) : null;
  const lastDate = dates.length ? new Date(Math.max(...dates)) : null;
  const subscriptions = charges.filter(c => c.isSubscription);
  const overlapCategories = ['streaming', 'music', 'cloud', 'news', 'fitness', 'food'];
  const byCategory = new Map();
  for (const c of subscriptions) {
    if (!byCategory.has(c.category)) byCategory.set(c.category, []);
    byCategory.get(c.category).push(c);
  }
  const overlaps = [...byCategory.entries()]
    .filter(([category, list]) => list.length > 1 && overlapCategories.includes(category))
    .map(([category, list]) => ({ category, charges: [...list].sort((a, b) => b.monthlyCost - a.monthlyCost) }))
    .sort((a, b) => b.charges.length - a.charges.length);

  return {
    charges,
    subscriptions,
    bills: charges.filter(c => !c.isSubscription),
    priceIncreases: charges.filter(c => c.hasPriceIncrease),
    overlaps,
    transactionCount: transactions.length,
    firstDate,
    lastDate,
    days: firstDate && lastDate ? Math.max(1, daysBetween(firstDate, lastDate)) : 0,
    monthlyTotal: charges.reduce((sum, c) => sum + c.monthlyCost, 0),
    yearlyTotal: charges.reduce((sum, c) => sum + c.yearlyCost, 0),
    subscriptionMonthlyTotal: subscriptions.reduce((sum, c) => sum + c.monthlyCost, 0),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// The example statement: three months of a typical household's card, ending today

export function exampleStatementCSV(today = new Date()) {
  const lines = ['Transaction Date,Description,Type,Amount'];
  const pad = n => String(n).padStart(2, '0');
  const add = (daysAgo, desc, amount, type = 'Sale') => {
    const d = addDays(startOfDay(today), -daysAgo);
    lines.push(`${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()},"${desc}",${type},${amount}`);
  };
  for (let month = 0; month < 3; month++) {
    const base = month * 30;
    add(base + 4, 'NETFLIX.COM 866-579-7172 CA', month === 2 ? '-15.49' : '-17.99');
    add(base + 9, 'SPOTIFY USA', '-11.99');
    add(base + 12, 'APPLE.COM/BILL 866-712-7753 CA', '-2.99');
    add(base + 15, 'PLANET FITNESS CLUB FEES', '-24.99');
    add(base + 18, 'DISNEY PLUS 888-905-7888 CA', '-15.99');
    add(base + 20, 'CITY POWER AND LIGHT AUTOPAY', `-${128 + month * 11}.40`);
    add(base + 22, 'SIRIUSXM RADIO', '-10.99');
    add(base + 6, 'KROGER #482', `-${96 + month * 7}.15`);
    add(base + 13, 'SHELL OIL 5744', '-48.20');
    add(base + 25, 'PAYMENT THANK YOU', '600.00', 'Payment');
  }
  add(27, 'HULU 877-8244858 CA', '-18.99');
  add(3, 'PEACOCK PREMIUM', '-7.99');
  add(33, 'PEACOCK PREMIUM', '-7.99');
  add(63, 'PEACOCK PREMIUM', '-7.99');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// Quick add: "Pay water bill $64 on the 15th every month" → a bill, $64, monthly, next due the 15th

export const KIND_LABELS = { task: 'Task', bill: 'Bill', subscription: 'Subscription', renewal: 'Renewal' };
export const AREA_LABELS = { personal: 'Personal', money: 'Money', car: 'Car', home: 'Home', health: 'Health',
  family: 'Family', work: 'Work' };
export const DOC_LABELS = { passport: 'Passport', driversLicense: "Driver's license", registration: 'Car registration',
  insuranceCard: 'Insurance card', warranty: 'Warranty', idCard: 'ID card' };

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

function containsAny(text, words) {
  return words.some(w => text.includes(w));
}

/** Removes [start, end) from text, leaving a space so words don't run together. */
function cut(text, start, end) {
  return text.slice(0, start) + ' ' + text.slice(end);
}

function findAmount(text) {
  const patterns = [
    /\$\s?([0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i,
    /\b([0-9]+(?:\.[0-9]{1,2})?)\s?(?:dollars|bucks|usd)\b/i,
    /(?<![\d/:.-])\b([0-9]{1,5}\.[0-9]{2})\b(?![\d/:-])/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (Number.isFinite(value)) return { cents: Math.round(value * 100), start: match.index, end: match.index + match[0].length };
    }
  }
  return null;
}

function findRelative(text, now) {
  const match = /\bin\s+(a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d{1,3})\s+(day|week|month|year)s?\b/i.exec(text);
  if (!match) return null;
  const token = match[1].toLowerCase();
  const count = NUMBER_WORDS[token] || parseInt(token, 10);
  if (!count) return null;
  const unit = match[2].toLowerCase();
  const rule = new Recurrence(count, unit);
  const moved = unit === 'day' || unit === 'week' ? addDays(now, count * (unit === 'week' ? 7 : 1)) : rule.advance(now);
  return { date: atNine(moved), start: match.index, end: match.index + match[0].length };
}

function findRecurrence(text) {
  const rules = [
    [/\bevery\s+(\d{1,3})\s+(day|week|month|year)s?\b/i, null],
    [/\b(every other week|every two weeks|biweekly|bi-weekly|every 2 weeks)\b/i, Recurrence.biweekly],
    [/\b(every quarter|quarterly)\b/i, Recurrence.quarterly],
    [/\b(twice a year|semi-?annually|semiannual|every six months)\b/i, Recurrence.semiannual],
    [/\b(every day|daily|each day)\b/i, Recurrence.daily],
    [/\b(every week|weekly|each week|(?<!in )a week|per week)\b/i, Recurrence.weekly],
    [/(\bevery month\b|\bmonthly\b|\beach month\b|\b(?<!in )a month\b|\bper month\b|\/mo\b|\/month\b)/i, Recurrence.monthly],
    [/(\bevery year\b|\byearly\b|\bannually\b|\bannual\b|\beach year\b|\b(?<!in )a year\b|\bper year\b|\/yr\b|\/year\b)/i, Recurrence.yearly],
  ];
  for (const [pattern, rule] of rules) {
    const match = pattern.exec(text);
    if (!match) continue;
    const range = { start: match.index, end: match.index + match[0].length };
    if (rule) return { rule, ...range };
    return { rule: new Recurrence(parseInt(match[1], 10), match[2].toLowerCase()), ...range };
  }
  return null;
}

function findDayOfMonth(text) {
  const match = /\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+of\s+(?:the|each|every)\s+month)?\b/i.exec(text);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  if (day < 1 || day > 31) return null;
  // Leave "the 15th of March" to the date reader.
  const after = text.slice(match.index + match[0].length).trim().toLowerCase().replace(/^of\s+/, '');
  if (MONTHS.some(mo => after.startsWith(mo))) return null;
  return { day, start: match.index, end: match.index + match[0].length };
}

function nextDayOfMonth(day, now) {
  let year = now.getFullYear();
  let month = now.getMonth();
  for (let i = 0; i < 3; i++) {
    const candidate = new Date(year, month, Math.min(day, daysInMonth(year, month)), 9, 0);
    if (candidate >= startOfDay(now)) return candidate;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  return now;
}

function findWeekday(text, now) {
  const match = /\b(every|each|next|this|on|by)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thu|fri|sat)s?\b/i.exec(text);
  if (!match) return null;
  const word = match[2].toLowerCase();
  const lead = (match[1] || '').toLowerCase();
  // Short forms only count with a lead-in word ("on fri"), so "sat on the couch" doesn't become Saturday.
  if (word.length <= 4 && !lead) return null;
  const index = WEEKDAYS.findIndex(d => d.startsWith(word.slice(0, 3)));
  if (index < 0) return null;
  const today = startOfDay(now);
  let ahead = (index - today.getDay() + 7) % 7;
  if (ahead === 0 && lead !== 'this') ahead = 7;
  if (lead === 'next' && ahead < 7 && ahead <= 2) ahead += 7;
  return { date: atNine(addDays(today, ahead)), weekly: lead === 'every' || lead === 'each',
    start: match.index, end: match.index + match[0].length };
}

/** Times like "3pm", "at 2:30 pm", "noon". */
function findTime(text) {
  const match = /\b(?:at\s+)?(?:(noon)|(midnight)|(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.))\b/i.exec(text);
  if (!match) return null;
  let hour;
  let minute = 0;
  if (match[1]) hour = 12;
  else if (match[2]) hour = 0;
  else {
    hour = parseInt(match[3], 10);
    minute = match[4] ? parseInt(match[4], 10) : 0;
    if (hour < 1 || hour > 12 || minute > 59) return null;
    const pm = match[5].toLowerCase().startsWith('p');
    if (pm && hour !== 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  return { hour, minute, start: match.index, end: match.index + match[0].length };
}

/** Natural dates: today, tonight, tomorrow, "Oct 30", "March 3 2027", "10/31", "the 15th of March". */
function findDate(text, now) {
  const today = startOfDay(now);
  const lead = '(?:(?:on|by|due|before|this|next)\\s+)?';
  const candidates = [];
  let match;
  const rel = new RegExp(`\\b${lead}(today|tonight|tomorrow|day after tomorrow)\\b`, 'i');
  if ((match = rel.exec(text))) {
    const word = match[1].toLowerCase();
    const offset = word === 'tomorrow' ? 1 : word === 'day after tomorrow' ? 2 : 0;
    const date = addDays(today, offset);
    candidates.push({ date, tonight: word === 'tonight', start: match.index, end: match.index + match[0].length });
  }
  const monthNames = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const md = new RegExp(`\\b${lead}(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i');
  if ((match = md.exec(text))) {
    const mi = monthIndex(match[1]);
    const year = match[3] ? parseInt(match[3], 10) : today.getFullYear();
    const date = makeDate(year, mi, parseInt(match[2], 10));
    if (date) candidates.push({ date, explicitYear: !!match[3], start: match.index, end: match.index + match[0].length });
  }
  const dm = new RegExp(`\\b${lead}(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthNames})\\b(?:,?\\s+(\\d{4}))?`, 'i');
  if ((match = dm.exec(text))) {
    const mi = monthIndex(match[2]);
    const year = match[3] ? parseInt(match[3], 10) : today.getFullYear();
    const date = makeDate(year, mi, parseInt(match[1], 10));
    if (date) candidates.push({ date, explicitYear: !!match[3], start: match.index, end: match.index + match[0].length });
  }
  const numeric = new RegExp(`\\b${lead}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?\\b`, 'i');
  if ((match = numeric.exec(text))) {
    const dayFirst = localeDayFirst();
    const a = parseInt(match[1], 10);
    const b = parseInt(match[2], 10);
    const year = match[3] ? parseInt(match[3], 10) : today.getFullYear();
    const date = dayFirst ? makeDate(year, b - 1, a) : makeDate(year, a - 1, b);
    if (date) candidates.push({ date, explicitYear: !!match[3], start: match.index, end: match.index + match[0].length });
  }
  // "March 2029": a month and year with no day (common for document expirations).
  const my = new RegExp(`\\b${lead}(?:in\\s+)?(${monthNames})\\.?,?\\s+(\\d{4})\\b`, 'i');
  if ((match = my.exec(text))) {
    const date = makeDate(parseInt(match[2], 10), monthIndex(match[1]), 1);
    if (date) candidates.push({ date, explicitYear: true, monthOnly: true, start: match.index, end: match.index + match[0].length });
  }
  if (!candidates.length) return null;
  const found = candidates.sort((x, y) => x.start - y.start)[0];
  let date = atNine(found.date);
  let hasTime = false;
  let { start, end } = found;
  let rest = text;
  if (found.tonight) {
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 20, 0);
    hasTime = true;
  }
  const time = findTime(cut(rest, start, end));
  if (time) {
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.hour, time.minute);
    hasTime = true;
  }
  return { date, hasTime, explicitYear: !!found.explicitYear, monthOnly: !!found.monthOnly, start, end, time };
}

function docKindIn(lower) {
  if (lower.includes('passport')) return 'passport';
  if (lower.includes('driver') || lower.includes('license') || lower.includes('licence')) return 'driversLicense';
  if (lower.includes('registration') || lower.includes('tag ') || lower.includes('tags')) return 'registration';
  if (lower.includes('insurance card')) return 'insuranceCard';
  if (lower.includes('warranty')) return 'warranty';
  if (lower.includes(' id ') || lower.includes('id card')) return 'idCard';
  return null;
}

function billCategory(lower) {
  if (containsAny(lower, ['rent', 'mortgage', 'hoa'])) return 'housing';
  if (containsAny(lower, ['electric', 'power', 'water', 'gas bill', 'sewer', 'trash', 'utility'])) return 'utilities';
  if (containsAny(lower, ['insurance', 'premium'])) return 'insurance';
  if (containsAny(lower, ['phone', 'cell', 'wireless'])) return 'phone';
  if (containsAny(lower, ['internet', 'wifi', 'cable', 'fiber'])) return 'internet';
  if (containsAny(lower, ['loan', 'car note', 'student'])) return 'loan';
  if (containsAny(lower, ['credit card', 'card payment', 'visa', 'amex', 'mastercard'])) return 'creditCard';
  if (containsAny(lower, ['daycare', 'childcare', 'babysit', 'nanny'])) return 'childcare';
  return null;
}

function areaFor(lower, kind) {
  if (kind === 'bill' || kind === 'subscription') return 'money';
  const map = [
    ['car', ['oil change', 'tire', 'car ', 'truck', 'registration', 'inspection', 'mechanic', 'brake', 'smog', 'car wash']],
    ['home', ['filter', 'hvac', 'gutter', 'lawn', 'mow', 'plumber', 'roof', 'furnace', 'smoke', 'dryer', 'water heater',
      'trash', 'yard', 'garage', 'pest', 'caulk', 'sprinkler', 'pool', 'septic', 'fridge', 'dishwasher']],
    ['health', ['doctor', 'dentist', 'pharmacy', 'prescription', 'refill', 'meds', 'checkup', 'physical', 'appointment', 'therapy']],
    ['family', ['mom', 'dad', 'kid', 'son', 'daughter', 'school', 'daycare', 'birthday', 'wife', 'husband', 'grandma',
      'grandpa', 'anniversary', 'family']],
    ['money', ['bank', 'tax', 'budget', 'invoice', 'transfer', 'deposit', 'credit', '401k', 'ira', 'statement']],
    ['work', ['meeting', 'client', 'boss', 'report', 'office', 'deadline', 'presentation', 'email']],
  ];
  for (const [area, words] of map) if (containsAny(lower, words)) return area;
  return 'personal';
}

export function cleanTitle(raw, kind) {
  let title = raw.replace(/\s+/g, ' ').trim();
  const lowerStarts = prefix => title.toLowerCase().startsWith(prefix);
  const lowerEnds = suffix => title.toLowerCase().endsWith(suffix);
  const leading = ['remind me to ', 'remind me ', 'remember to ', "don't forget to ", 'dont forget to ', 'i need to ',
    'need to ', 'i have to ', 'have to ', 'todo ', 'to do ', 'add '];
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of leading) if (lowerStarts(prefix)) { title = title.slice(prefix.length); changed = true; }
  }
  if (kind === 'renewal') {
    for (const prefix of ['renew my ', 'renew the ', 'renew ']) if (lowerStarts(prefix)) { title = title.slice(prefix.length); break; }
    for (const suffix of [' expires', ' expiration', ' expiring', ' expiration date', ' renewal', ' is due', ' due']) {
      if (lowerEnds(suffix)) { title = title.slice(0, -suffix.length); break; }
    }
  }
  if (kind === 'bill' || kind === 'subscription') {
    for (const prefix of ['pay the ', 'pay my ', 'pay ']) if (lowerStarts(prefix)) { title = title.slice(prefix.length); break; }
    for (const suffix of [' free trial ends', ' trial ends', ' free trial', ' trial', ' subscription', ' membership']) {
      if (lowerEnds(suffix)) { title = title.slice(0, -suffix.length); break; }
    }
  }
  const trailing = [' on', ' by', ' at', ' every', ' due', ' for', ' the', ' is', ' and', ' ,', ' -', ' starting', ' from', ' ends'];
  changed = true;
  while (changed) {
    changed = false;
    for (const suffix of trailing) if (lowerEnds(suffix)) { title = title.slice(0, -suffix.length); changed = true; }
    while (title && '.,;:-– '.includes(title[title.length - 1])) { title = title.slice(0, -1); changed = true; }
  }
  title = title.trim();
  return title ? title[0].toUpperCase() + title.slice(1) : '';
}

/** Reads a sentence like "Pay water bill $64 on the 15th every month" and works out what it is. */
export function parseCapture(input, now = new Date()) {
  let text = ' ' + input.trim().replace(/\n/g, ' ') + ' ';
  const lower = text.toLowerCase();
  const result = { kind: 'task', title: '', date: null, hasTime: false, monthOnly: false, amount: null, repeats: null, area: 'personal',
    isTrial: false, docKind: null, category: 'other', merchantKey: null };

  const amount = findAmount(text);
  if (amount) { result.amount = amount.cents; text = cut(text, amount.start, amount.end); }

  // "in 2 weeks", "in a month": a date, not a repeat
  const relative = findRelative(text, now);
  if (relative) { result.date = relative.date; text = cut(text, relative.start, relative.end); }

  const recurrence = findRecurrence(text);
  if (recurrence) { result.repeats = recurrence.rule; text = cut(text, recurrence.start, recurrence.end); }

  const dayOfMonth = findDayOfMonth(text);
  if (dayOfMonth) { result.date = nextDayOfMonth(dayOfMonth.day, now); text = cut(text, dayOfMonth.start, dayOfMonth.end); }

  if (!result.date) {
    const weekday = findWeekday(text, now);
    if (weekday) {
      result.date = weekday.date;
      if (weekday.weekly && !result.repeats) result.repeats = Recurrence.weekly;
      text = cut(text, weekday.start, weekday.end);
      const time = findTime(text);
      if (time) {
        result.date = new Date(result.date.getFullYear(), result.date.getMonth(), result.date.getDate(), time.hour, time.minute);
        result.hasTime = true;
        text = cut(text, time.start, time.end);
      }
    }
  }

  let explicitYear = /\b(19|20)\d{2}\b/.test(lower);
  if (!result.date) {
    const found = findDate(text, now);
    if (found) {
      result.date = found.date;
      result.hasTime = found.hasTime;
      result.monthOnly = found.monthOnly;
      explicitYear = explicitYear || found.explicitYear;
      text = cut(text, found.start, found.end);
      if (found.time) {
        const time = findTime(text);
        if (time) text = cut(text, time.start, time.end);
      }
    }
  }

  if (lower.includes('trial')) {
    result.isTrial = true;
    result.kind = 'subscription';
    if (!result.repeats) result.repeats = Recurrence.monthly;
  }

  const merchant = matchMerchant(lower);
  if (merchant) {
    result.merchantKey = merchant.key;
    result.category = merchant.category;
    if (result.kind === 'task') result.kind = isSubscriptionLike(merchant.category) ? 'subscription' : 'bill';
    if (!result.repeats) result.repeats = Recurrence.monthly;
  }

  if (result.kind === 'task') {
    const doc = docKindIn(lower);
    if (doc && containsAny(lower, ['expire', 'expires', 'expiration', 'renew', 'renewal', 'due'])) {
      result.kind = 'renewal';
      result.docKind = doc;
    }
  }

  if (result.kind === 'task') {
    const billWords = ['bill', 'pay ', 'payment', 'rent', 'mortgage', 'premium', 'insurance', 'utility', 'electric', 'water bill',
      'gas bill', 'internet', 'phone bill', 'loan', 'tuition', 'daycare', 'invoice', 'car note'];
    if (containsAny(lower, billWords) && (result.amount != null || result.repeats)) {
      result.kind = 'bill';
      if (!result.repeats) result.repeats = Recurrence.monthly;
    } else if (containsAny(lower, ['subscription', 'subscribe', 'membership', 'streaming'])) {
      result.kind = 'subscription';
      if (!result.repeats) result.repeats = Recurrence.monthly;
    }
  }

  if (result.kind === 'bill') result.category = billCategory(lower) || result.category;
  if (result.kind === 'subscription' && result.category === 'other') result.category = 'streaming';
  result.area = areaFor(lower, result.kind);

  // Birthdays and anniversaries repeat every year.
  if (containsAny(lower, ['birthday', 'anniversary'])) {
    result.repeats = result.repeats || Recurrence.yearly;
    result.area = 'family';
  }

  result.title = cleanTitle(text, result.kind) || input.trim();

  // A month and day already past this year means next year.
  if (result.date && result.date < startOfDay(now) && !explicitYear) {
    const d = result.date;
    result.date = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------------------
// Formatting

export function formatMoney(cents, { whole = false } = {}) {
  const value = cents / 100;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD',
    minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(value);
}

export function formatDate(date, { year = false, weekday = false } = {}) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}),
    ...(weekday ? { weekday: 'short' } : {}) }).format(date);
}
