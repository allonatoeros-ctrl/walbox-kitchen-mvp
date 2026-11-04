# Food Club V1 — Fase 3 (stato)

## ORA (2026-11-04)
- **Dove:** `walbox-kitchen-release/docs/food-club/fase3/` (file non ancora in un commit, branch attuale `docs/stato-31-10`).
  Base: `origin/docs/food-club-fase2` (d8b8064), copiato in `fase2/`. Codice di riferimento: `origin/main` (595f639).
- **Fase:** 3 = revisione finale + piano tecnico. STOP alla consegna; niente codice, migration, commit, push, deploy.
- **Consegne:** `walrus-food-club-prototipo-v3.html`, `anteprime/*.png` (390/430), `FASE3-piano-tecnico.md`
  (regole, stati ordine/buono, piano a fasi, rischi/decisioni, stima attività), `audit-codice.md` (analisi read-only).
- **F0 FATTA (2026-11-04), verdetto PARZIALE** → `F0-rapporto.md` (evidenze in `f0/`). F1 NON approvata.
  D-6 chiusa: tessera = telefono verificato, recupero su altro dispositivo fattibile (stesso uid, biglietto di unione).
- **Prossimo passo:** Eros controlla in produzione "Confirm phone" (bloccante P1) e la voce Supabase $75 Phone,
  decide D-13…D-16 + aperte (§4 del rapporto), poi eventuale Gate 1 di F1.
- **Decisioni aperte:** D-1,2,3,4,5,7,8,11,12 + nuove D-13…D-16 (`F0-rapporto.md` §4) + D-17…D-22 (PWA/notifiche).
- **PWA + notifiche (2026-11-04, FATTO, in attesa di approvazione; 20 preset, 41 png, collage controllato):** audit e specifica in `PWA-NOTIFICHE-spec.md`; prototipo
  `walrus-food-club-prototipo-v4.html` (copia di v3 + gruppo 9) e screenshot `anteprime-pwa/` → note in
  `PROTOTIPO-v4-pwa.md`. STOP per approvazione prima di qualsiasi implementazione (I-1…I-7 della spec §7).
## Lavori in corso
- [x] audit codice ordini/pagamenti → `audit-codice.md` (verificato a campione: sweep solo POP, promo pass atomico)
- [x] prototipo v3 + 75 anteprime (`PROTOTIPO-v3-modifiche.md`); controllata a campione la tessera 390
- [x] piano tecnico `FASE3-piano-tecnico.md` (decisioni D-1…D-12)
- [x] F0: migration, prova Auth locale isolata, SMS, riesame decisioni → `F0-rapporto.md`
- STOP: in attesa di Eros. Nessuna modifica al codice, a produzione o a git.
