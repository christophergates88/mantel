// Simmer's background helper: shows the morning reminder when the server nudges this phone.
const q = new URL(self.location).searchParams;
const API = q.get('api'), HOUSE = q.get('house');
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let body = 'Open Simmer to see tonight\'s dinner.';
    try {
      const doc = await (await fetch(`${API}/house/${HOUSE}`)).json();
      body = (doc && doc.briefs && doc.briefs[dayKey(new Date())]) || 'Nothing is planned for tonight yet.';
    } catch { /* offline: show the plain message */ }
    await self.registration.showNotification('Simmer', { body, icon: 'icon-180.png', badge: 'icon-180.png', tag: 'simmer-morning' });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => (list[0] ? list[0].focus() : self.clients.openWindow('./'))));
});
