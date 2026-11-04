// WALRUS FOOD CLUB V1 — cattura di beforeinstallprompt/appinstalled all'avvio (PWA spec §2.1, I-3/I-4).
// Va inizializzato in main.jsx prima del render: Chrome emette l'evento una sola volta, presto.
const LS_INSTALLED = 'walbox_pwa_installed';
const LS_STANDALONE_SEEN = 'walbox_pwa_standalone_seen';
const LS_INVITE = 'walbox_pwa_invite';

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(); } catch { /* listener rotto: ignora */ } });

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, val) { try { localStorage.setItem(key, val); } catch { /* storage non disponibile */ } }

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  try {
    return window.matchMedia?.('(display-mode: standalone)')?.matches === true || window.navigator.standalone === true;
  } catch { return false; }
}

export function initPwaInstallCapture() {
  if (typeof window === 'undefined' || window.__walboxPwaInit) return;
  window.__walboxPwaInit = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // il prompt parte SOLO dal tocco su INSTALLA WALBOX
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    safeSet(LS_INSTALLED, String(Date.now()));
    notify();
  });
}

export function hasInstallPrompt() { return deferredPrompt != null; }
export function installedFlag() { return safeGet(LS_INSTALLED) != null; }

// Ritorna 'accepted' | 'dismissed' | 'unavailable'
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const e = deferredPrompt;
  deferredPrompt = null;
  notify();
  try {
    await e.prompt();
    const choice = await e.userChoice;
    if (choice?.outcome === 'accepted') safeSet(LS_INSTALLED, String(Date.now()));
    return choice?.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'unavailable';
  }
}

export function subscribePwa(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Prima apertura in standalone su questo dispositivo (misura dell'installazione iPhone, stima per difetto).
export function consumeFirstStandaloneOpen() {
  if (!isStandalone() || safeGet(LS_STANDALONE_SEEN)) return false;
  safeSet(LS_STANDALONE_SEEN, String(Date.now()));
  safeSet(LS_INSTALLED, safeGet(LS_INSTALLED) ?? String(Date.now()));
  return true;
}

// Stato "Non ora" degli inviti (per dispositivo).
export function readInviteMemory() {
  try { return JSON.parse(safeGet(LS_INVITE) || '{}') || {}; } catch { return {}; }
}
export function writeInviteMemory(patch) {
  const next = { ...readInviteMemory(), ...patch };
  safeSet(LS_INVITE, JSON.stringify(next));
  notify();
  return next;
}
export function dismissInstall() {
  const m = readInviteMemory();
  return writeInviteMemory({ dismissedAt: Date.now(), dismissCount: (m.dismissCount || 0) + 1 });
}
export function dismissPush() {
  const m = readInviteMemory();
  return writeInviteMemory({ pushDismissedAt: Date.now(), pushDismissCount: (m.pushDismissCount || 0) + 1 });
}
export function ackPushDenied() { return writeInviteMemory({ deniedAcked: true }); }

// Service worker registrato all'avvio (solo push/notificationclick, nessuna cache), così la PWA installata
// ha già il SW prima del tocco su ATTIVA NOTIFICHE.
export function registerServiceWorkerEarly() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => { /* non bloccante */ });
}
