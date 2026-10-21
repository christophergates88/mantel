// Torvard website: the live assistant in the phone, the in-browser leak finder, the proof counters and the lamp.
// Everything here runs in the visitor's browser. The page's security policy (connect-src 'none') means it
// couldn't send what they type or open even if it tried.

import {
  readStatement, analyze, exampleStatementCSV, nextExpected, formatMoney, formatDate,
  StatementError, STATEMENT_ERRORS, CATEGORY_LABELS,
} from './engine.js';
import { Aide, exampleHousehold } from './aide.js';
import { APP_STORE_URL } from './config.js';

const SVG = 'http://www.w3.org/2000/svg';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Small DOM helper: el('p', { class: 'x' }, 'text', child). Text is always set as text, never as HTML. */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function icon(name) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

// ---------------------------------------------------------------------------------------------------------------
// The phone: ask the Riveras' Torvard anything

const ICONS = { check: 'check', card: 'card', repeat: 'repeat', doc: 'doc', cal: 'cal', hourglass: 'hourglass', home: 'home', phone: 'phone', lock: 'lock' };

function setupAsk() {
  const log = document.getElementById('ask-log');
  const input = document.getElementById('ask-input');
  const send = document.getElementById('ask-send');
  const orbs = [document.getElementById('orb'), document.getElementById('orb-mini')].filter(Boolean);
  const orb = { classList: { add: c => orbs.forEach(o => o.classList.add(c)), remove: c => orbs.forEach(o => o.classList.remove(c)) } };
  const speakerButton = document.getElementById('ask-speaker');
  if (!log || !input) return;
  const aide = new Aide(exampleHousehold(new Date()), new Date());
  let busy = false;
  let userActed = false;

  // Read aloud with the voices built into this device only, so the words never go to a speech server.
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  const localVoice = () => {
    const voices = synth ? synth.getVoices().filter(v => v.localService && /^en(-|_|$)/i.test(v.lang)) : [];
    return voices.find(v => /samantha|ava|allison|karen|daniel/i.test(v.name)) || voices[0] || null;
  };
  let speakOn = false;
  if (!synth) speakerButton.hidden = true;
  speakerButton.addEventListener('click', () => {
    speakOn = !speakOn;
    speakerButton.setAttribute('aria-pressed', String(speakOn));
    if (!speakOn) synth?.cancel();
  });
  const speak = text => {
    if (!speakOn || !synth) return;
    const voice = localVoice();
    if (!voice) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.rate = 1.03;
    u.onstart = () => orb.classList.add('speaking');
    u.onend = u.onerror = () => orb.classList.remove('speaking');
    synth.speak(u);
  };

  const scrollDown = () => { log.scrollTop = log.scrollHeight; };

  const render = (answerBox, answer) => {
    answerBox.replaceChildren(el('p', {}, answer.text));
    if (answer.items?.length) {
      answerBox.append(el('ul', {}, answer.items.slice(0, 6).map(item =>
        el('li', {}, el('span', { class: 'ico' }, icon(ICONS[item.icon] || 'check')), el('div', {}, el('b', {}, item.title), el('span', {}, item.detail))))));
    }
    if (answer.action) {
      const button = el('button', { type: 'button' }, answer.action);
      const row = el('div', { class: 'act' }, button);
      button.addEventListener('click', () => {
        row.replaceWith(el('p', { class: 'done' }, `✓ ${answer.done}`));
        speak(answer.done);
        scrollDown();
      });
      answerBox.append(row);
    }
    if (answer.follow?.length) {
      const row = el('div', { class: 'follow' }, answer.follow.map(f => {
        const b = el('button', { type: 'button' }, f);
        b.addEventListener('click', () => ask(f));
        return b;
      }));
      answerBox.append(row);
    }
  };

  const ask = (raw, { instant = false } = {}) => {
    const q = String(raw || '').trim();
    if (!q || busy) return;
    busy = true;
    input.value = '';
    log.classList.add('talking');
    const answerBox = el('div', { class: 'a' }, el('div', { class: 'thinking-dots', 'aria-label': 'Thinking' }, el('span'), el('span'), el('span')));
    const turn = el('div', { class: 'turn' }, el('p', { class: 'q' }, q), answerBox);
    log.append(turn);
    scrollDown();
    orb.classList.add('thinking');
    const answer = aide.answer(q);
    // A short beat so it reads as an answer, not a page flicker. The work itself takes about a millisecond.
    setTimeout(() => {
      orb.classList.remove('thinking');
      render(answerBox, answer);
      // Show the question and the start of the answer, even when the answer is long.
      log.scrollTop = Math.max(0, turn.offsetTop - log.offsetTop - 8);
      speak(answer.text);
      busy = false;
    }, instant || reducedMotion ? 0 : 420);
  };

  send.addEventListener('click', () => { userActed = true; ask(input.value); });
  input.addEventListener('focus', () => { userActed = true; });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); ask(input.value); }
  });

  const device = document.querySelector('.hero-device');
  document.getElementById('examples')?.addEventListener('click', event => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    userActed = true;
    ask(chip.textContent);
    const rect = device.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      device.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    }
  });

  // The one moment on load: the phone asks for its own brief, as if someone just said "Brief me."
  if (reducedMotion) {
    ask('Brief me', { instant: true });
  } else {
    const words = 'Brief me';
    let i = 0;
    setTimeout(function type() {
      if (userActed) return;
      i += 1;
      input.value = words.slice(0, i);
      if (i < words.length) setTimeout(type, 70);
      else setTimeout(() => { if (!userActed) ask(words); }, 260);
    }, 900);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The leak finder: read a statement in this tab

function money(cents) {
  return formatMoney(cents, { whole: cents >= 10000 });
}

function perCadence(charge) {
  const unit = charge.cadence.unit;
  if (charge.cadence.every === 1 && unit === 'month') return `${formatMoney(charge.amount)}/mo`;
  if (charge.cadence.every === 1 && unit === 'year') return `${formatMoney(charge.amount)}/yr`;
  if (charge.cadence.every === 1 && unit === 'week') return `${formatMoney(charge.amount)}/wk`;
  return `${formatMoney(charge.amount)} ${charge.cadence.phrase}`;
}

function insightLines(report) {
  const lines = [];
  for (const charge of report.priceIncreases) {
    const extra = Math.round((charge.amount - charge.previousAmount) * charge.cadence.timesPerYear);
    lines.push(el('p', { class: 'up' }, icon('up'),
      el('span', {}, `${charge.name} went up from ${formatMoney(charge.previousAmount)} to ${formatMoney(charge.amount)}, about ${formatMoney(extra, { whole: true })} more a year.`)));
  }
  for (const overlap of report.overlaps) {
    const total = overlap.charges.reduce((sum, c) => sum + c.monthlyCost, 0);
    const label = (CATEGORY_LABELS[overlap.category] || overlap.category).toLowerCase();
    lines.push(el('p', { class: 'overlap' }, icon('layers'),
      el('span', {}, `You pay for ${overlap.charges.length} ${label} services, ${formatMoney(total, { whole: true })} a month together: ${overlap.charges.map(c => c.name).join(', ')}.`)));
  }
  if (!lines.length) lines.push(el('p', {}, icon('check'), el('span', {}, 'No price increases or overlapping services in this statement.')));
  return lines;
}

function chargeRow(charge) {
  const sub = el('p', { class: 'sub' },
    el('span', {}, charge.isSubscription ? 'Subscription' : 'Bill'),
    el('span', {}, `Last ${formatDate(charge.lastDate)}`),
    el('span', {}, `Next about ${formatDate(nextExpected(charge))}`),
    el('span', {}, `${money(charge.yearlyCost)}/yr`));
  if (charge.hasPriceIncrease) sub.append(el('span', { class: 'flag up' }, 'Price went up'));
  if (charge.seenOnce) sub.append(el('span', { class: 'flag once' }, 'Seen once'));
  if (charge.cancelURL) {
    sub.append(el('a', { href: charge.cancelURL, target: '_blank', rel: 'noopener noreferrer' }, 'Cancel page'));
  }
  return el('li', {}, el('span', { class: 'name' }, charge.name), el('span', { class: 'amount' }, perCadence(charge)), sub);
}

function setupLeakFinder() {
  const scanner = document.getElementById('scanner');
  const input = document.getElementById('statement');
  const example = document.getElementById('use-example');
  const errorBox = document.getElementById('scan-error');
  const reportBox = document.getElementById('report');
  if (!scanner) return;

  const showError = message => {
    errorBox.textContent = message;
    errorBox.hidden = false;
    reportBox.hidden = true;
  };

  const show = (text, name) => {
    let report;
    try {
      report = analyze(readStatement(text, name));
    } catch (error) {
      showError(error instanceof StatementError ? error.message : STATEMENT_ERRORS.unreadable);
      return;
    }
    errorBox.hidden = true;
    const count = report.charges.length;
    document.getElementById('total-count').textContent = `${count} recurring charge${count === 1 ? '' : 's'}`;
    document.getElementById('total-month').textContent = `${money(report.monthlyTotal)} a month`;
    document.getElementById('total-detail').textContent =
      `${money(report.yearlyTotal)} a year, from ${report.transactionCount} transactions over ${report.days} days.`;
    document.getElementById('insights').replaceChildren(...insightLines(report));
    document.getElementById('charges').replaceChildren(...report.charges.map(chargeRow));
    if (!count) {
      document.getElementById('charges').replaceChildren(el('li', {}, el('span', { class: 'name' },
        'No repeating charges found. Two or three months of transactions gives the best results.')));
    }
    reportBox.hidden = false;
    reportBox.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  const readFile = async file => {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) return showError('That file is larger than a statement usually is. Try a CSV of the last two or three months.');
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return showError(STATEMENT_ERRORS.pdf);
    try {
      show(await file.text(), file.name);
    } catch {
      showError(STATEMENT_ERRORS.unreadable);
    }
  };

  input.addEventListener('change', () => {
    readFile(input.files[0]);
    input.value = '';
  });
  example.addEventListener('click', () => show(exampleStatementCSV(new Date()), 'example.csv'));

  // Dropping a file anywhere else shouldn't make the browser open it in place of the page.
  for (const type of ['dragover', 'drop']) window.addEventListener(type, event => event.preventDefault());
  scanner.addEventListener('dragover', event => {
    event.preventDefault();
    scanner.classList.add('over');
  });
  scanner.addEventListener('dragleave', () => scanner.classList.remove('over'));
  scanner.addEventListener('drop', event => {
    event.preventDefault();
    scanner.classList.remove('over');
    readFile(event.dataTransfer?.files?.[0]);
  });
}

// ---------------------------------------------------------------------------------------------------------------
// The proof: count anything this page tries to send

function setupProof() {
  const requestsOut = document.getElementById('count-requests');
  const blockedOut = document.getElementById('count-blocked');
  if (!requestsOut) return;
  let requests = 0;
  let blocked = 0;
  const update = () => {
    requestsOut.textContent = String(requests);
    blockedOut.textContent = String(blocked);
  };
  // Page files (pictures, the stylesheet, this script) are downloads. Sending looks like fetch, XHR or a beacon.
  const sending = new Set(['fetch', 'xmlhttprequest', 'beacon']);
  try {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (sending.has(entry.initiatorType)) requests += 1;
      update();
    }).observe({ type: 'resource', buffered: true });
  } catch {
    // Older browsers without PerformanceObserver: nothing to count.
  }
  document.addEventListener('securitypolicyviolation', event => {
    const directive = event.effectiveDirective || event.violatedDirective || '';
    if (directive.startsWith('connect-src') || directive.startsWith('form-action')) {
      blocked += 1;
      update();
    }
  });
  update();
}

// ---------------------------------------------------------------------------------------------------------------
// Night: the lamp comes on when you reach the end

function setupLamp() {
  const final = document.getElementById('get');
  if (!final) return;
  if (!('IntersectionObserver' in window)) {
    final.classList.add('lit');
    return;
  }
  const observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      final.classList.add('lit');
      observer.disconnect();
    }
  }, { threshold: 0.45 });
  observer.observe(final);
}

// The header turns to night once the page passes dusk.
function setupHeader() {
  const header = document.querySelector('.top');
  const dusk = document.getElementById('private');
  if (!header || !dusk) return;
  let queued = false;
  const update = () => {
    queued = false;
    header.classList.toggle('dark', dusk.getBoundingClientRect().top <= header.offsetHeight);
  };
  window.addEventListener('scroll', () => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}

// ---------------------------------------------------------------------------------------------------------------
// Every "Get" button leads to the App Store once there's a link

function setupStoreLinks() {
  if (!APP_STORE_URL) return;
  for (const link of document.querySelectorAll('[data-get]')) link.href = APP_STORE_URL;
  const button = document.querySelector('[data-store]');
  if (button) {
    const link = el('a', { class: button.className, href: APP_STORE_URL }, 'Download on the App Store');
    button.replaceWith(link);
  }
  const lede = document.querySelector('#get .lede');
  if (lede) lede.textContent = 'Torvard for iPhone is free to download. Premium is optional.';
}

setupAsk();
setupLeakFinder();
setupProof();
setupLamp();
setupHeader();
setupStoreLinks();
