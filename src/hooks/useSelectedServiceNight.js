// Kitchen Analytics V1 — selettore service night, un solo stato condiviso da TUTTA Analytics
// (Storico + Cassa), decisione Eros (Gate 1, 2026-09-21).
//
// Storico (overlay dentro KitchenSoloService.jsx) e Cassa (route separata /kitchen/payments,
// KitchenPayments.jsx) sono due alberi React montati in momenti diversi dallo stesso router SPA
// (App.jsx: pushState/popstate, nessun full reload — vedi kitchen-night-preview-isolation test
// per conferma dello stesso pattern). Un modulo esterno (useSyncExternalStore) sopravvive al
// cambio di route esattamente come un Context lo farebbe, senza toccare il routing (area
// protetta) ne' introdurre una dipendenza nuova: "Apri Cassa →" da uno Storico su una notte
// passata ora apre la Cassa sulla STESSA notte, non su "oggi".
//
// `null` = "oggi", segue automaticamente il rollover 06:00 (la finestra si sposta da sola senza
// bisogno di alcun aggiornamento di questo stato). Una stringa 'YYYY-MM-DD' e' una notte
// esplicita — anche se coincide col giorno corrente puo' capitare solo transitoriamente: goNext
// e goToDate la ricollassano a `null` quando raggiungono "oggi", cosi' lo stato torna a seguire
// il rollover invece di restare agganciato a una data che sta per diventare "ieri".
import { useSyncExternalStore } from 'react';
import { serviceNightWindow, shiftServiceNight } from '../lib/kitchenServiceRules';

// V1: navigazione storica limitata agli ultimi 30 giorni (decisione Eros, Gate 1 2026-09-21).
// Oltre non e' un limite tecnico ma una scelta di scope, legata al rischio limit-1000 righe
// PostgREST su kitchen_orders senza .range() — vedi
// ai-ops/reports/kitchen-analytics-service-night-selector-audit-20260921.md RISKS §1.
export const MAX_HISTORY_DAYS = 30;

let selected = null;
const listeners = new Set();

function setSelected(next) {
  if (next === selected) return;
  selected = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return selected;
}

// Esporta un reset esplicito solo per i test (isolamento tra casi): non usato da nessun
// componente applicativo.
export function __resetSelectedServiceNightForTests() {
  selected = null;
}

export function useSelectedServiceNight() {
  const selectedServiceNight = useSyncExternalStore(subscribe, getSnapshot);
  const todayNight = serviceNightWindow().night;
  const resolvedNight = selectedServiceNight ?? todayNight;
  const oldestAllowedNight = shiftServiceNight(todayNight, -(MAX_HISTORY_DAYS - 1));

  const goToday = () => setSelected(null);

  const goToDate = (night) => {
    if (!night) return;
    const clamped = night < oldestAllowedNight ? oldestAllowedNight : night > todayNight ? todayNight : night;
    setSelected(clamped === todayNight ? null : clamped);
  };

  const goPrev = () => {
    if (resolvedNight <= oldestAllowedNight) return;
    setSelected(shiftServiceNight(resolvedNight, -1));
  };

  const goNext = () => {
    const candidate = shiftServiceNight(resolvedNight, 1);
    setSelected(candidate >= todayNight ? null : candidate);
  };

  return {
    selectedServiceNight,
    resolvedNight,
    isToday: selectedServiceNight === null,
    disablePrev: resolvedNight <= oldestAllowedNight,
    disableNext: selectedServiceNight === null,
    oldestAllowedNight,
    todayNight,
    goToday,
    goPrev,
    goNext,
    goToDate,
  };
}
