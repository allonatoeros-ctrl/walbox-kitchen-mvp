// Walbox Kitchen — service worker minimale (F6 Phase 1, 2026-09-24).
// Scopo unico: ricevere Web Push e portare a fuoco/aprire lo stato ordine al click sulla
// notifica. Nessun intercept di 'fetch', nessuna cache offline — deliberato (vedi audit
// ai-ops/reports/kitchen-f6-webpush-audit-20260924.md, WHAT_NOT_TO_BUILD).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const title = payload.title || 'Walbox Kitchen';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.svg',
    badge: payload.badge || '/favicon.svg',
    tag: payload.orderId ? `kitchen-order-${payload.orderId}` : undefined,
    data: {
      orderId: payload.orderId || null,
      url: payload.url || '/kitchen/status',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/kitchen/status';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
