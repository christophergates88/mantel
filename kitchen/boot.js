// Loads the newest copy of the app. version.txt changes with every update, so phones pick it up straight away.
const v = await fetch('version.txt', { cache: 'no-store' }).then(r => r.ok ? r.text() : '').then(t => t.trim()).catch(() => '');
const q = v ? '?v=' + encodeURIComponent(v) : '';
document.querySelector('link[rel=stylesheet]').href = 'app.css' + q;
import('./app.js' + q);
