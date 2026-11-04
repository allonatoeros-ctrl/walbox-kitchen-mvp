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

  // Due contratti di payload, entrambi accettati:
  // - "ordine pronto" (send-order-ready-push): { orderId, title, body, url } -> tag kitchen-order-<id>
  //   (comportamento invariato).
  // - Food Club (send-food-club-push): { title, body, tag: 'food-club-<kind>', url,
  //   data: { url, kind } } -> il tag per tipo fa sostituire la notifica precedente dello stesso tipo.
  const data = payload.data && typeof payload.data === 'object' ? payload.data : {};
  const title = payload.title || 'Walbox Kitchen';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.svg',
    badge: payload.badge || '/favicon.svg',
    tag: payload.orderId
      ? `kitchen-order-${payload.orderId}`
      : (typeof payload.tag === 'string' && payload.tag ? payload.tag : undefined),
    data: {
      orderId: payload.orderId || null,
      url: payload.url || data.url || '/kitchen/status',
      kind: data.kind || payload.kind || null,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/kitchen/status';
  const targetHref = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1) Una finestra dell'app già sullo stesso URL: solo in primo piano.
      for (const client of clientList) {
        if (client.url === targetHref && 'focus' in client) return client.focus();
      }
      // 2) Un'altra finestra dell'app: in primo piano e portata sull'URL. focus() e navigate()
      //    partono subito, dentro il gesto del click (come prima); se navigate() fallisce
      //    (finestra non controllata dal SW) la finestra resta comunque in primo piano.
      for (const client of clientList) {
        if ('focus' in client) {
          const focused = client.focus();
          if ('navigate' in client) {
            return Promise.all([focused, client.navigate(targetUrl).catch(() => null)]);
          }
          return focused;
        }
      }
      // 3) Nessuna finestra: ne apre una nuova.
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
