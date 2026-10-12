// appVersion.js — "app sempre aggiornata" (I-6, 2026-10-12).
// Una scheda/PWA aperta da prima di un deploy continua a eseguire il JS vecchio (es. senza header
// Authorization verso le API di pagamento). Il bundle di produzione ha nome con hash
// (/assets/index-<hash>.js): se l'index.html servito ora punta a un bundle diverso da quello in
// esecuzione, c'e' una versione nuova. Su dev server non c'e' hash: controllo disattivato.

export const VERSION_RELOAD_KEY = 'walbox_kitchen_version_reload_for';

const BUNDLE_SRC_RE = /<script\b[^>]*\bsrc=["'](\/assets\/index-[A-Za-z0-9_-]+\.js)["']/;

export function extractBundleSrc(html) {
  if (typeof html !== 'string') return null;
  const m = html.match(BUNDLE_SRC_RE);
  return m ? m[1] : null;
}

/** Bundle realmente in esecuzione nel documento corrente (null su dev server o fuori dal browser). */
export function getRunningBundleSrc(doc = globalThis.document) {
  try {
    const el = doc?.querySelector?.('script[src*="/assets/index-"]');
    const src = el?.getAttribute('src');
    return src ? new URL(src, 'http://x').pathname : null;
  } catch {
    return null;
  }
}

/** -> { status: 'current' | 'stale' | 'unknown' | 'disabled', remoteSrc? }. Non lancia mai. */
export async function checkAppVersion({ runningSrc, fetchImpl = globalThis.fetch } = {}) {
  if (!runningSrc) return { status: 'disabled' };
  try {
    const res = await fetchImpl('/index.html', { cache: 'no-store' });
    if (!res?.ok) return { status: 'unknown' };
    const remoteSrc = extractBundleSrc(await res.text());
    if (!remoteSrc) return { status: 'unknown' };
    return remoteSrc === runningSrc ? { status: 'current' } : { status: 'stale', remoteSrc };
  } catch {
    return { status: 'unknown' };
  }
}

function defaultStorage() {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

/** Anti-loop: al massimo 1 reload per versione remota. Storage non disponibile -> false (fail-safe). */
export function shouldReloadForVersion(remoteSrc, storage = defaultStorage()) {
  if (!storage || !remoteSrc) return false;
  try {
    return storage.getItem(VERSION_RELOAD_KEY) !== remoteSrc;
  } catch {
    return false;
  }
}

export function markReloadedForVersion(remoteSrc, storage = defaultStorage()) {
  try { storage?.setItem(VERSION_RELOAD_KEY, remoteSrc); } catch { /* best-effort */ }
}

/**
 * Controlla e, se c'e' una versione nuova non ancora tentata, ricarica la pagina.
 * -> true se ha avviato il reload (il chiamante deve fermarsi), false altrimenti.
 * Mai bloccante: qualunque errore/offline/CDN in ritardo -> false.
 */
export async function reloadIfStale() {
  const result = await checkAppVersion({ runningSrc: getRunningBundleSrc() });
  if (result.status !== 'stale' || !shouldReloadForVersion(result.remoteSrc)) return false;
  markReloadedForVersion(result.remoteSrc);
  globalThis.location.reload();
  return true;
}
