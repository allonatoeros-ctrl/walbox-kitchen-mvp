# Food Club V1 — fix footer checkout 320×568 (2026-11-05)
Verdetto: PASS (solo CSS). Nessun commit/push/deploy.
Causa: regressione delle modifiche NON committate dello sprint UX (riepilogo a 3 righe + nota + PAGO più alti). Ultimo commit (a58c7ef) con buono: 208px a 320×568.
Fix: `src/components/foodclub/ClubCheckout.css`, un blocco `@media (max-height:600px)` con `.cx-footer:has(.fc-sum)`: attivo solo con buono applicato e schermo basso.
Misure footer con buono (altezza / % schermo): 320×568 293px/52% -> 227px/40% (commit: 208px/37%) · 375×667 272px/41% invariato · 390×844 290px/34% invariato.
Senza buono e Club disattivato: screenshot identici byte per byte a prima, a tutti e 3 i viewport.
PAGO ORA / PAGO AL BANCO: 48px di altezza, una riga, sempre visibili. Totale "DA PAGARE" 26px, riga sconto leggibile.
Limite: con nome mancante a 320×568 il footer è 240px (42%); la nota "importo confermato…" resta a 2 righe.
Lint: ok. Build (override Supabase locale, outDir temporaneo): ok.
Screenshot: ai-ops/reports/food-club-ux-shots/footer-320/{prima,dopo}/
Verifica fatta su pagina di prova fuori repo (stessi componenti, dati finti, Docker/DB spenti), non sul flusso reale con DB.
