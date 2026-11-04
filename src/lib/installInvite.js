// WALRUS FOOD CLUB V1 — rilevamento ambiente e scelta dell'invito installazione/notifiche (PWA-NOTIFICHE-spec §2, §3).
// Funzioni pure: nessun accesso a window qui (lo fa useInstallState), così sono testabili.

export const INSTALL_SNOOZE_DAYS = 14;
export const INSTALL_MAX_DISMISS = 3;

// ua: navigator.userAgent; maxTouchPoints per iPadOS che si spaccia per Mac.
export function detectPlatform({ ua = '', maxTouchPoints = 0 } = {}) {
  const s = String(ua);
  const isIpadOs = /Macintosh/.test(s) && maxTouchPoints > 1;
  const ios = /iPhone|iPad|iPod/.test(s) || isIpadOs;
  const android = /Android/.test(s);
  const inApp = /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Line\/|Snapchat|LinkedInApp|Twitter/i.test(s);
  let browser = 'other';
  if (ios) {
    if (/CriOS/.test(s)) browser = 'chrome';
    else if (/EdgiOS/.test(s)) browser = 'edge';
    else if (/FxiOS/.test(s)) browser = 'firefox';
    else if (/Safari/.test(s) && !inApp) browser = 'safari';
  } else if (android) {
    if (/SamsungBrowser/.test(s)) browser = 'samsung';
    else if (/Firefox/.test(s)) browser = 'firefox';
    else if (/EdgA/.test(s)) browser = 'edge';
    else if (/Chrome/.test(s)) browser = 'chrome';
  }
  let iosVersion = null;
  const m = s.match(/OS (\d+)[_.](\d+)/);
  if (ios && m) iosVersion = Number(m[1]) + Number(m[2]) / 100;
  const os = ios ? 'ios' : android ? 'android' : 'desktop';
  return { os, browser, inApp, iosVersion, pushCapableIos: ios ? (iosVersion == null || iosVersion >= 16.04) : null };
}

export function platformLabel(p) {
  return `${p.os}-${p.inApp ? 'inapp' : p.browser}`;
}

// Invito da mostrare in un contesto. Ritorna { kind, guide } con kind:
//  'none' | 'install-prompt' (Android con evento) | 'install-guide' (istruzioni) | 'open-in-browser' |
//  'installed-hint' | 'push' | 'push-denied-info' | 'ios-too-old'
export function resolveInstallInvite({
  platform, standalone = false, bipAvailable = false, installedFlag = false,
  permission = 'default', subscribed = false, pushSupported = true, member = false,
  context = 'tessera', dismissedAt = null, dismissCount = 0, pushDismissedAt = null, pushDismissCount = 0,
  deniedAcked = false, now = Date.now(),
}) {
  if (!platform || platform.os === 'desktop') return { kind: 'none', reason: 'desktop' };
  // Mai inviti durante menu/sacco/checkout/pagamento/OTP.
  if (!['join', 'tessera', 'status', 'home'].includes(context)) return { kind: 'none', reason: 'context' };
  const snoozed = dismissedAt != null && now - dismissedAt < INSTALL_SNOOZE_DAYS * 86400000;
  const exhausted = dismissCount >= INSTALL_MAX_DISMISS;
  // "Non ora" sulle notifiche ha un contatore proprio (rifiutare l'installazione non spegne le notifiche).
  const pushSnoozed = (pushDismissedAt != null && now - pushDismissedAt < INSTALL_SNOOZE_DAYS * 86400000)
    || pushDismissCount >= INSTALL_MAX_DISMISS;

  const pushStep = () => {
    if (!member) return { kind: 'none', reason: 'not_member' };
    if (platform.os === 'ios' && platform.pushCapableIos === false) return { kind: 'ios-too-old' };
    if (!pushSupported) return { kind: 'none', reason: 'push_unsupported' };
    if (subscribed && permission === 'granted') return { kind: 'none', reason: 'already_on' };
    if (permission === 'denied') return deniedAcked ? { kind: 'none', reason: 'denied_acked' } : { kind: 'push-denied-info' };
    if (pushSnoozed) return { kind: 'none', reason: 'snoozed' };
    return { kind: 'push' };
  };

  if (standalone) return pushStep();

  if (platform.inApp) return snoozed || exhausted ? { kind: 'none', reason: 'snoozed' } : { kind: 'open-in-browser', guide: platform.os };

  if (platform.os === 'android') {
    // Su Android la push funziona anche senza installare.
    if (installedFlag) return { kind: 'installed-hint' };
    if (snoozed || exhausted) return pushStep();
    if (bipAvailable) return { kind: 'install-prompt' };
    return { kind: 'install-guide', guide: `android-${platform.browser}` };
  }

  // iPhone non installato: push impossibile finché non si installa.
  if (installedFlag) return { kind: 'installed-hint' };
  if (snoozed || exhausted) return { kind: 'none', reason: 'snoozed' };
  return { kind: 'install-guide', guide: `ios-${platform.browser}` };
}

// Passi della guida per browser (testi della spec §2.1, da verificare su dispositivo reale).
export function installGuideSteps(guide) {
  switch (guide) {
    case 'ios-safari':
      return ['Tocca Condividi ↑ in basso', 'Scegli «Aggiungi alla schermata Home»', 'Tocca «Aggiungi», poi apri Walbox dall’icona'];
    case 'ios-chrome':
    case 'ios-edge':
    case 'ios-firefox':
      return ['Tocca il tasto Condividi del browser (in alto a destra)', 'Scegli «Aggiungi alla schermata Home»', 'Se non c’è, apri questa pagina in Safari'];
    case 'ios-other':
      return ['Apri questa pagina in Safari', 'Tocca Condividi ↑', 'Scegli «Aggiungi alla schermata Home»'];
    case 'android-chrome':
    case 'android-edge':
      return ['Tocca il menu ⋮ in alto a destra', 'Scegli «Installa app» o «Aggiungi a schermata Home»', 'Conferma e apri Walbox dall’icona'];
    case 'android-samsung':
      return ['Tocca il menu ≡ in basso', 'Scegli «Aggiungi pagina a» → «Schermata Home»', 'Apri Walbox dall’icona'];
    case 'android-firefox':
    case 'android-other':
      return ['Tocca il menu ⋮', 'Scegli «Installa» o «Aggiungi a schermata Home»', 'Apri Walbox dall’icona'];
    case 'ios':
    case 'android':
      return ['Tocca il menu ⋯ dell’app', 'Scegli «Apri nel browser»', 'Da lì aggiungi Walbox alla schermata Home'];
    default:
      return [];
  }
}

// Titolo della card notifiche (D-20 aperta: variante per stato, proposta della spec).
export function pushCardTitle({ hasVoucher }) {
  return hasVoucher ? 'NON PERDERTI I TUOI 5 €' : 'IL TUO PREMIO TI ASPETTA';
}
