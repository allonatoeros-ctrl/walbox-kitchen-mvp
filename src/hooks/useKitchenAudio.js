import { useCallback, useEffect, useRef, useState } from 'react';

const ENABLED_KEY = 'walbox_kitchen_audio_enabled_v1';
const SEEN_KEY = 'walbox_kitchen_audio_seen_paid_v1';

function readEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) !== 'false'; } catch { return true; }
}

function tone(context, frequency, delay = 0, { peakGain = 0.14, attack = 0.015, duration = 0.22 } = {}) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(peakGain, context.currentTime + delay + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(context.currentTime + delay);
  oscillator.stop(context.currentTime + delay + duration + 0.02);
}

// Chime: fondamentale + overtone all'ottava superiore a gain ridotto e decadimento più rapido —
// timbro "glassy"/campanellante (tipo notifica iPhone) invece del sine puro e morbido di tone().
// Attacco secco (6ms vs 15ms) per un onset più netto e percepito come più presente/udibile.
// Usato solo da notifyNewOrder(): non tocca tone()/play()/notifyCounterPayment().
function chime(context, frequency, delay, { peakGain = 0.3, attack = 0.006, duration = 0.35 } = {}) {
  tone(context, frequency, delay, { peakGain, attack, duration });
  tone(context, frequency * 2, delay, { peakGain: peakGain * 0.35, attack, duration: duration * 0.55 });
}

// Nuovo-ordine (Sprint3B T3 UX fix, iterazione "più udibile, tipo iPhone"): doppio richiamo a 2
// note ascendenti (990→1320Hz, quarta giusta — più brillanti delle 660/880 iniziali), separato da
// una pausa — pattern "ding-ding ... ding-ding", ~1.56s totali, volume deciso (peakGain 0.3) con
// timbro a campana (chime, vedi sopra) per restare udibile in un locale rumoroso senza diventare
// aggressivo. Onset a delay 0: nessun ritardo percepito. Non tocca notifyCounterPayment.
const NEW_ORDER_CALL_GAP = 1.05;
const NEW_ORDER_PATTERN = [
  { frequency: 990, delay: 0 },
  { frequency: 1320, delay: 0.16 },
  { frequency: 990, delay: NEW_ORDER_CALL_GAP },
  { frequency: 1320, delay: NEW_ORDER_CALL_GAP + 0.16 },
];

// Browser-only pilot audio. Seen IDs persist in sessionStorage so refresh/reconnect/multi-tab
// never replay historical paid orders as if they were newly received.
export function useKitchenAudio() {
  const [enabled, setEnabled] = useState(readEnabled);
  const contextRef = useRef(null);
  const initializedRef = useRef(false);
  const seenRef = useRef(new Set());

  useEffect(() => {
    try { seenRef.current = new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]')); } catch { /* storage unavailable */ seenRef.current = new Set(); }
  }, []);

  const remember = useCallback((id) => {
    if (!id) return;
    seenRef.current.add(id);
    try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seenRef.current].slice(-300))); } catch { /* storage unavailable */ }
  }, []);

  const unlock = useCallback(async () => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    if (!contextRef.current) contextRef.current = new AudioContext();
    if (contextRef.current.state === 'suspended') await contextRef.current.resume();
    return contextRef.current.state === 'running';
  }, []);

  // P1-1: il primo ordine della giornata può arrivare prima che lo staff tocchi qualunque
  // elemento della pagina — senza un gesture, i browser tengono l'AudioContext sospeso e
  // observeOrders() (chiamato da un effect, non da un click) resta silenzioso senza alcun
  // avviso visivo (vedi ai-ops/reports/kitchen-solo-final-operational-review.md P1-1). Un solo
  // ascolto one-shot sul primo tap/click qualsiasi sblocca il contesto in anticipo: nessun suono
  // viene riprodotto qui, solo resume() dell'AudioContext.
  useEffect(() => {
    let done = false;
    const armAudioContext = () => {
      if (done) return;
      done = true;
      window.removeEventListener('pointerdown', armAudioContext);
      window.removeEventListener('click', armAudioContext);
      unlock();
    };
    window.addEventListener('pointerdown', armAudioContext, { once: true });
    window.addEventListener('click', armAudioContext, { once: true });
    return () => {
      window.removeEventListener('pointerdown', armAudioContext);
      window.removeEventListener('click', armAudioContext);
    };
  }, [unlock]);

  const play = useCallback(async (frequencies) => {
    if (!enabled || !(await unlock())) return false;
    frequencies.forEach((frequency, index) => tone(contextRef.current, frequency, index * 0.14));
    return true;
  }, [enabled, unlock]);

  const notifyNewOrder = useCallback(async () => {
    if (!enabled || !(await unlock())) return false;
    NEW_ORDER_PATTERN.forEach(({ frequency, delay }) => chime(contextRef.current, frequency, delay));
    return true;
  }, [enabled, unlock]);

  const toggle = useCallback(async () => {
    const next = !enabled;
    setEnabled(next);
    try { localStorage.setItem(ENABLED_KEY, String(next)); } catch { /* storage unavailable */ }
    if (next) await unlock();
  }, [enabled, unlock]);

  const observeOrders = useCallback((orders) => {
    // Notifica un ordine "appena arrivato" sia se già pagato (pronto per la cucina), sia se
    // ancora da incassare al banco (pending_counter_payment) — in entrambi i casi lo staff
    // deve accorgersene subito. Suono distinto da notifyCounterPayment(), che è l'evento
    // separato di conferma pagamento riuscita.
    const notifiable = orders.filter((order) =>
      order.status === 'pending_counter_payment' ||
      (order.paymentStatus === 'paid' && ['received', 'preparing'].includes(order.status))
    );
    if (!initializedRef.current) {
      notifiable.forEach((order) => remember(order.id));
      initializedRef.current = true;
      return;
    }
    notifiable.forEach((order) => {
      if (seenRef.current.has(order.id)) return;
      remember(order.id);
      notifyNewOrder();
    });
  }, [notifyNewOrder, remember]);

  const notifyCounterPayment = useCallback((orderId) => {
    remember(orderId);
    return play([440, 660, 880]);
  }, [play, remember]);

  return { enabled, toggle, unlock, observeOrders, notifyCounterPayment };
}
