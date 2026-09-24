// F6 Notification Decision Gate — test delle regole di visibilità dell'overlay (2026-09-24).
// Stile repo: funzioni pure testate direttamente, nessun browser/DOM necessario.
// Eseguire a mano: node --test tests/unit/f6-notification-gate.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { shouldShowNotificationGate, shouldShowIosInstallGate } = await import('../../src/lib/webPush.js');

test('overlay: permission default + idle (configurato) -> visibile', () => {
  assert.equal(
    shouldShowNotificationGate({ status: 'idle', permission: 'default', dismissed: false }),
    true
  );
});

test('overlay: permission default + error -> visibile (retry possibile)', () => {
  assert.equal(
    shouldShowNotificationGate({ status: 'error', permission: 'default', dismissed: false }),
    true
  );
});

test('overlay: permission default + subscribing -> resta visibile (CTA disabilitata)', () => {
  assert.equal(
    shouldShowNotificationGate({ status: 'subscribing', permission: 'default', dismissed: false }),
    true
  );
});

test('overlay: già attivo (subscribed) -> NON visibile', () => {
  assert.equal(
    shouldShowNotificationGate({ status: 'subscribed', permission: 'granted', dismissed: false }),
    false
  );
});

test('overlay: permission granted ma stato ancora idle -> NON visibile (già avvisabile)', () => {
  assert.equal(
    shouldShowNotificationGate({ status: 'idle', permission: 'granted', dismissed: false }),
    false
  );
});

test('overlay: permission denied -> NON visibile (nessun loop dopo un rifiuto)', () => {
  assert.equal(
    shouldShowNotificationGate({ status: 'denied', permission: 'denied', dismissed: false }),
    false
  );
});

test('overlay: configurato ma permission denied (stato idle) -> NON visibile', () => {
  assert.equal(
    shouldShowNotificationGate({ status: 'idle', permission: 'denied', dismissed: false }),
    false
  );
});

test('overlay: browser non supportato -> NON visibile', () => {
  assert.equal(
    shouldShowNotificationGate({ status: 'unsupported', permission: 'default', dismissed: false }),
    false
  );
});

test('overlay: VAPID non configurata -> NON visibile', () => {
  assert.equal(
    shouldShowNotificationGate({ status: 'not-configured', permission: 'default', dismissed: false }),
    false
  );
});

test('overlay: "continua senza" già scelto per questo ordine -> NON visibile', () => {
  assert.equal(
    shouldShowNotificationGate({ status: 'idle', permission: 'default', dismissed: true }),
    false
  );
});

test('overlay: dismissed prevale su qualunque stato attivabile', () => {
  for (const status of ['idle', 'error', 'subscribing']) {
    assert.equal(
      shouldShowNotificationGate({ status, permission: 'default', dismissed: true }),
      false,
      `status ${status} con dismissed deve restare nascosto`
    );
  }
});

// ── Gate informativo iOS/Safari non-PWA (F6 final UX patch) ──

test('iOS: unsupported + iOS non-PWA -> gate informativo visibile', () => {
  assert.equal(
    shouldShowIosInstallGate({ supported: false, iosNonPwa: true, dismissed: false }),
    true
  );
});

test('iOS: supportato -> nessun gate iOS (prevale il gate classico)', () => {
  assert.equal(
    shouldShowIosInstallGate({ supported: true, iosNonPwa: true, dismissed: false }),
    false
  );
});

test('iOS: non-iOS/desktop unsupported -> nessun gate iOS', () => {
  assert.equal(
    shouldShowIosInstallGate({ supported: false, iosNonPwa: false, dismissed: false }),
    false
  );
});

test('iOS: "CONTINUA" già scelto per questo ordine -> nessun gate iOS', () => {
  assert.equal(
    shouldShowIosInstallGate({ supported: false, iosNonPwa: true, dismissed: true }),
    false
  );
});

test('iOS: standalone PWA (iosNonPwa=false) -> nessun gate informativo', () => {
  assert.equal(
    shouldShowIosInstallGate({ supported: false, iosNonPwa: false, dismissed: false }),
    false
  );
});