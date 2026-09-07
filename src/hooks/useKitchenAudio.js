import { useCallback, useEffect, useRef, useState } from 'react';

const ENABLED_KEY = 'walbox_kitchen_audio_enabled_v1';
const SEEN_KEY = 'walbox_kitchen_audio_seen_paid_v1';

function readEnabled() {
  try { return localStorage.getItem(ENABLED_KEY) !== 'false'; } catch { return true; }
}

function tone(context, frequency, delay = 0) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
  gain.gain.exponentialRampToValueAtTime(0.14, context.currentTime + delay + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.22);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(context.currentTime + delay);
  oscillator.stop(context.currentTime + delay + 0.24);
}

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
      play([660, 880]);
    });
  }, [play, remember]);

  const notifyCounterPayment = useCallback((orderId) => {
    remember(orderId);
    return play([440, 660, 880]);
  }, [play, remember]);

  return { enabled, toggle, unlock, observeOrders, notifyCounterPayment };
}
