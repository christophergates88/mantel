// Cason website: the live assistant, ask-by-topic, the in-browser leak finder, the read-aloud brief and the proof.
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

const now = new Date();
const aide = new Aide(exampleHousehold(now), now);
const ICONS = new Set(['check', 'card', 'repeat', 'doc', 'cal', 'hourglass', 'home', 'phone', 'lock']);

// ---------------------------------------------------------------------------------------------------------------
// Speaking, with the voices built into this device only, so the words never go to a speech server.

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
function localVoice() {
  const voices = synth ? synth.getVoices().filter(v => v.localService && /^en(-|_|$)/i.test(v.lang)) : [];
  return voices.find(v => /samantha|ava|allison|karen|daniel|serena/i.test(v.name)) || voices[0] || null;
}

/** Say it, or return false when there's no on-device voice to say it with. */
function say(text, { onStart, onEnd } = {}) {
  const voice = localVoice();
  if (!synth || !voice) return false;
  synth.cancel();
  // "Cason" is said KAY-sun; spelling it that way keeps browser voices from guessing "CAH-son".
  const u = new SpeechSynthesisUtterance(String(text).replace(/\bCason\b/g, 'Kay-sun'));
  u.voice = voice;
  u.rate = 1.02;
  u.onstart = () => onStart?.();
  u.onend = u.onerror = () => onEnd?.();
  synth.speak(u);
  return true;
}

/** An answer, rendered: the sentence, the items, an action to confirm, and follow-up questions. */
function renderAnswer(box, answer, { onFollow, onDone } = {}) {
  box.replaceChildren(el('p', {}, answer.text));
  if (answer.items?.length) {
    box.append(el('ul', { class: 'items' }, answer.items.slice(0, 6).map(item =>
      el('li', {},
        el('span', { class: 'ico' }, icon(ICONS.has(item.icon) ? item.icon : 'check')),
        el('span', {}, el('b', {}, item.title), el('span', { class: 'd' }, item.detail))))));
  }
  if (answer.action) {
    const button = el('button', { class: 'pill small', type: 'button' }, answer.action);
    const row = el('div', { class: 'act' }, button);
    button.addEventListener('click', () => {
      row.replaceWith(el('p', { class: 'done' }, `✓ ${answer.done}`));
      onDone?.(answer.done);
    });
    box.append(row);
  }
  if (answer.follow?.length && onFollow) {
    box.append(el('div', { class: 'follow' }, answer.follow.map(f => {
      const b = el('button', { type: 'button' }, f);
      b.addEventListener('click', () => onFollow(f));
      return b;
    })));
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The console: ask the Riveras' Cason anything

function setupAsk() {
  const form = document.getElementById('ask-form');
  const input = document.getElementById('ask-input');
  const orb = document.getElementById('orb');
  const qOut = document.getElementById('reply-q');
  const aOut = document.getElementById('reply-a');
  const speaker = document.getElementById('ask-speaker');
  if (!form) return;
  let busy = false;
  let userActed = false;
  let speakOn = false;

  if (!synth) speaker.hidden = true;
  speaker.addEventListener('click', () => {
    speakOn = !speakOn;
    speaker.setAttribute('aria-pressed', String(speakOn));
    if (!speakOn) synth?.cancel();
  });
  const speak = text => {
    if (speakOn) say(text, { onStart: () => orb.classList.add('speaking'), onEnd: () => orb.classList.remove('speaking') });
  };

  const ask = (raw, { instant = false } = {}) => {
    const q = String(raw || '').trim();
    if (!q || busy) return;
    busy = true;
    input.value = '';
    qOut.textContent = q;
    aOut.classList.remove('fresh');
    aOut.replaceChildren(el('div', { class: 'dots', role: 'status', 'aria-label': 'Thinking' }, el('span'), el('span'), el('span')));
    orb.classList.add('thinking');
    const answer = aide.answer(q);
    // A short beat so it reads as an answer, not a flicker. The work itself takes about a millisecond.
    setTimeout(() => {
      orb.classList.remove('thinking');
      renderAnswer(aOut, answer, { onFollow: f => { userActed = true; ask(f); }, onDone: speak });
      void aOut.offsetWidth;
      aOut.classList.add('fresh');
      speak(answer.text);
      busy = false;
    }, instant || reducedMotion ? 0 : 450);
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    userActed = true;
    ask(input.value);
  });
  input.addEventListener('focus', () => { userActed = true; });

  document.getElementById('examples')?.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    userActed = true;
    ask(button.textContent);
  });

  // The one moment on load: someone says "Brief me," and Cason answers.
  if (reducedMotion) {
    ask('Brief me', { instant: true });
    return;
  }
  const words = 'Brief me';
  let i = 0;
  setTimeout(function type() {
    if (userActed) return;
    i += 1;
    input.value = words.slice(0, i);
    if (i < words.length) setTimeout(type, 75);
    else setTimeout(() => { if (!userActed) ask(words); }, 280);
  }, 1000);
}

// ---------------------------------------------------------------------------------------------------------------
// Ask by topic: each question answers right under its row

function setupTopics() {
  const list = document.getElementById('topics');
  if (!list) return;
  list.addEventListener('click', event => {
    const button = event.target.closest('.ask-chip');
    if (!button) return;
    const box = button.closest('.topic').querySelector('.topic-answer');
    if (!box.hidden && box.dataset.q === button.textContent) {
      box.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      return;
    }
    box.dataset.q = button.textContent;
    renderAnswer(box, aide.answer(button.textContent));
    box.hidden = false;
    button.setAttribute('aria-expanded', 'true');
  });
  for (const button of list.querySelectorAll('.ask-chip')) button.setAttribute('aria-expanded', 'false');
}

// ---------------------------------------------------------------------------------------------------------------
// Hear the brief

function setupListen() {
  const button = document.getElementById('listen');
  const note = document.getElementById('listen-note');
  if (!button) return;
  const label = button.querySelector('span');
  const use = button.querySelector('use');
  let playing = false;
  const reset = () => {
    playing = false;
    label.textContent = "Hear the Riveras' brief";
    use.setAttribute('href', '#i-play');
  };
  button.addEventListener('click', () => {
    if (playing) {
      synth?.cancel();
      reset();
      return;
    }
    const ok = say(aide.answer('Brief me').text, {
      onStart: () => {
        playing = true;
        label.textContent = 'Stop';
        use.setAttribute('href', '#i-stop');
      },
      onEnd: reset,
    });
    note.hidden = ok;
  });
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
// The core lights up when you reach the end

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

// A hairline under the header once the page scrolls.
function setupHeader() {
  const header = document.querySelector('.top');
  if (!header) return;
  let queued = false;
  const update = () => {
    queued = false;
    header.classList.toggle('scrolled', window.scrollY > 8);
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
  if (button) button.replaceWith(el('a', { class: 'pill lamp', href: APP_STORE_URL }, 'Download on the App Store'));
  const lede = document.getElementById('get-lede');
  if (lede) lede.textContent = 'Free for iPhone. Premium is optional.';
}

setupAsk();
setupTopics();
setupListen();
setupLeakFinder();
setupProof();
setupLamp();
setupHeader();
setupStoreLinks();
