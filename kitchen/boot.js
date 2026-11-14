// Loads the newest copy of the app. version.txt changes with every update, so phones pick it up straight away.
// With a weak signal it stops waiting after 2.5 seconds and uses the last version this phone loaded.
const last = () => { try { return localStorage.getItem('simmer.version') || ''; } catch { return ''; } };
const v = await fetch('version.txt', { cache: 'no-store', signal: AbortSignal.timeout(2500) }).then(r => r.ok ? r.text() : '').then(t => t.trim()).catch(() => '') || last();
try { if (v) localStorage.setItem('simmer.version', v); } catch { /* no storage */ }
const q = v ? '?v=' + encodeURIComponent(v) : '';
document.querySelector('link[rel=stylesheet]').href = 'app.css' + q;
import('./app.js' + q);
