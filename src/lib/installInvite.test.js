import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectPlatform, resolveInstallInvite, installGuideSteps, pushCardTitle } from './installInvite.js';

const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  iosOld: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
  iosInsta: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
};

test('rilevamento piattaforma', () => {
  assert.deepEqual(detectPlatform({ ua: UA.iosSafari }), { os: 'ios', browser: 'safari', inApp: false, iosVersion: 17.05, pushCapableIos: true });
  assert.equal(detectPlatform({ ua: UA.iosChrome }).browser, 'chrome');
  assert.equal(detectPlatform({ ua: UA.iosOld }).pushCapableIos, false);
  assert.equal(detectPlatform({ ua: UA.iosInsta }).inApp, true);
  assert.equal(detectPlatform({ ua: UA.android }).browser, 'chrome');
  assert.equal(detectPlatform({ ua: UA.samsung }).browser, 'samsung');
  assert.equal(detectPlatform({ ua: UA.desktop }).os, 'desktop');
  assert.equal(detectPlatform({ ua: UA.ipad, maxTouchPoints: 5 }).os, 'ios');
});

const base = { member: true, context: 'tessera' };
test('iPhone Safari non installato -> guida; mai un finto INSTALLA', () => {
  const r = resolveInstallInvite({ ...base, platform: detectPlatform({ ua: UA.iosSafari }), bipAvailable: true });
  assert.deepEqual(r, { kind: 'install-guide', guide: 'ios-safari' });
});
test('in-app -> apri nel browser', () => {
  assert.equal(resolveInstallInvite({ ...base, platform: detectPlatform({ ua: UA.iosInsta }) }).kind, 'open-in-browser');
});
test('Android con evento -> prompt vero; senza evento -> guida menu', () => {
  const p = detectPlatform({ ua: UA.android });
  assert.equal(resolveInstallInvite({ ...base, platform: p, bipAvailable: true }).kind, 'install-prompt');
  assert.deepEqual(resolveInstallInvite({ ...base, platform: p }), { kind: 'install-guide', guide: 'android-chrome' });
});
test('standalone -> notifiche; iOS vecchio -> niente pulsante notifiche', () => {
  assert.equal(resolveInstallInvite({ ...base, platform: detectPlatform({ ua: UA.iosSafari }), standalone: true }).kind, 'push');
  assert.equal(resolveInstallInvite({ ...base, platform: detectPlatform({ ua: UA.iosOld }), standalone: true }).kind, 'ios-too-old');
  assert.equal(resolveInstallInvite({ ...base, platform: detectPlatform({ ua: UA.iosSafari }), standalone: true, permission: 'granted', subscribed: true }).reason, 'already_on');
});
test('permesso negato: card informativa una volta, poi niente (mai requestPermission di nuovo)', () => {
  const p = detectPlatform({ ua: UA.android });
  assert.equal(resolveInstallInvite({ ...base, platform: p, standalone: true, permission: 'denied' }).kind, 'push-denied-info');
  assert.equal(resolveInstallInvite({ ...base, platform: p, standalone: true, permission: 'denied', deniedAcked: true }).kind, 'none');
});
test('"Non ora": 14 giorni di pausa, max 3 volte; Android in pausa installazione passa alle notifiche', () => {
  const now = Date.now();
  const ios = detectPlatform({ ua: UA.iosSafari });
  assert.equal(resolveInstallInvite({ ...base, platform: ios, dismissedAt: now - 86400000, now }).kind, 'none');
  assert.equal(resolveInstallInvite({ ...base, platform: ios, dismissedAt: now - 15 * 86400000, now }).kind, 'install-guide');
  assert.equal(resolveInstallInvite({ ...base, platform: ios, dismissCount: 3, now }).kind, 'none');
  assert.equal(resolveInstallInvite({ ...base, platform: detectPlatform({ ua: UA.android }), dismissCount: 3, now }).kind, 'push');
});
test('contesti vietati e desktop', () => {
  const p = detectPlatform({ ua: UA.iosSafari });
  for (const context of ['menu', 'cart', 'checkout', 'payment', 'otp']) {
    assert.equal(resolveInstallInvite({ ...base, platform: p, context }).kind, 'none', context);
  }
  assert.equal(resolveInstallInvite({ ...base, platform: detectPlatform({ ua: UA.desktop }) }).kind, 'none');
});
test('già installata aperta dal browser -> riga piccola', () => {
  assert.equal(resolveInstallInvite({ ...base, platform: detectPlatform({ ua: UA.iosSafari }), installedFlag: true }).kind, 'installed-hint');
});
test('guide e titolo card', () => {
  assert.equal(installGuideSteps('ios-safari').length, 3);
  assert.equal(installGuideSteps('android-samsung').length, 3);
  assert.equal(pushCardTitle({ hasVoucher: true }), 'NON PERDERTI I TUOI 5 €');
  assert.equal(pushCardTitle({ hasVoucher: false }), 'IL TUO PREMIO TI ASPETTA');
});
