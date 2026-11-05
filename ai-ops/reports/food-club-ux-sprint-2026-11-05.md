# Verifica sprint UX Food Club V1 — 2026-11-05

**Verdetto: PASS** (nessun P0/P1; 2 note P2). Tutto su stack locale, dati finti, nessun PAGO ORA, nessun pagamento confermato.
Legenda: [V] verificato (eseguito/misurato) · [D] dedotto (da codice/CSS, non visto a runtime).

## Verifiche
| Passo | Esito | Evidenza |
|---|---|---|
| A. Premio 2/2: blocco giallo, `fc-celebrate` presente | OK [V] | 02-premio-conquistato.png; testid presente al primo accesso |
| A. Ricarica: la festa non riparte | OK [V] | 02b; chiave localStorage `walbox_fc_celebrated_<voucher>=1`; dopo reload `fc-celebrate` assente |
| A. Reduced motion | OK [V] | `.fc-confetti` display:none; `.fc-stamp--on`/`.fc-deadline--reward` animation none. Senza reduced: fcStampIn 0,5s x2, fcRewardPop 0,5s, 12 raggi fcRay 1,1s. 02c |
| B. USA IL PREMIO → menu | OK [V] | URL `/kitchen` |
| B. Importi checkout identici al PRIMA | OK [V] | senza buono 13,90; con buono 13,90 / −5,00 / 8,90, testata TOTALE 8,90. 01b, 01 |
| B. Footer sticky a 390x844 | OK [V] | footer 302 px (36% schermo); body drawer scrollabile (678 px visibili); ultimo campo (note) a y=424, footer inizia a y=542: nulla coperto |
| B. PAGO ORA/AL BANCO più grandi + focus | OK [V] | 168x76 px ciascuno; focus Tab: outline 3 px crema + anello 2 px scuro. 01c |
| C. PAGO AL BANCO → RISERVATO | OK [V] | DB: voucher `reserved` (reserved_order_id=A08), ordine `pending_counter_payment`, total 8.9, discount_amount 5. 04d, 04d-buoni, 04e |
| C. Testo Opzione C, niente CTA USA IL PREMIO | OK [V] | "resta riservato finché il pagamento non è chiuso del tutto; se annullato senza alcun pagamento, torna disponibile"; chip "RISERVATO · #A08"; nessuna CTA |
| D. Annulla da staff /kitchen/solo | ENV_BLOCKER [V] | la UI chiama `POST /api/kitchen-cancel-with-payment-check` → 404 sul Vite dev (le funzioni `api/` non girano). "Annullamento non riuscito" |
| D. Rilascio buono | OK [V] | annullamento fatto con UPDATE SQL locale `status='cancelled'` (stesso percorso del trigger DB, non dell'API): voucher `available`, stessa scadenza 05/12. UI: chip "RILASCIATO" + "USALO ORA". 04f |
| E. Nuovo giro / usato / 1 su 2 | OK [V] | 04 (NUOVO GIRO 1/2, premio storico "già usato"), 04b (+04b2 tab USATI: buono UTILIZZATO spento), 04c |
| F. Staff: KPI e statistiche | OK [V] | 4 KPI: 3 / 6 / 1 / 5,00 € = PRIMA. details chiuso e aperto: tutte le statistiche del PRIMA presenti (+ "Da tenere d'occhio"). Unica differenza: SMS inviato 10→13 (i miei 3 login OTP, atteso). 03, 03b |
| F. Badge rosso anomalie | [D] | anomalie = 0, badge non visibile; esiste in codice (`fcs-more-badge`, #b91c1c su bianco, `FoodClubStaffPage.jsx:182`) |
| G. Focus tastiera | OK [V] | CTA PAGO (vedi sopra); `summary` staff outline 3 px giallo, offset 2 px (03c) |
| G. Console | OK [V] | nessun errore nuovo; solo 422 su `/auth/v1/user` (x4) durante il login OTP, quasi certamente preesistente [D] |
| H. eslint | OK [V] | exit 0, 0 problemi |
| H. node --test foodClubRules | OK [V] | 13 test, 13 pass, 0 fail |

## Importi checkout (Pulled Pork 13,90 €)
| | PRIMA | DOPO |
|---|---|---|
| Senza buono | 13,90 | 13,90 |
| Con buono | 13,90 / −5,00 / 8,90 | 13,90 / −5,00 / 8,90 (testata TOTALE 8,90) |

## Stati buono visti (utente 3330000002)
available (giallo, premio + "USALO ORA") → reserved (tratteggio, RISERVATO · #A08) → available (RILASCIATO, scadenza invariata). Utente 3330000001: used (UTILIZZATO spento, storico premi). 3330000003: tessera 1/2.

## Contrasti misurati (colori computed, soglia 4,5)
- Premio giallo/nero: titolo e testo 12,63; CTA USA IL PREMIO 13,58; sottotesto CTA 16,18.
- Buono disponibile: 12,63 (importo/regola/codice); chip RILASCIATO 13,58.
- Buono riservato: 9,78 (regola) – 15,22; chip 12,63.
- Buono utilizzato: 9,29 nominale, con opacità 0,70 effettivo 5,09 (regola/importo), chip 7,48.
- Riepilogo checkout: 12,14–14,46 (righe), nota importo 9,29, testata TOTALE 12,78, PAGO 12,63.
- KPI staff: valori 9,57–15,71; sottotitoli 6,99; summary 15,71.
- Badge anomalie: [D] circa 6,5 (#fff su #b91c1c).
Tutti >= 4,5.

## Difetti
- P2 — Il buono utilizzato è il caso più basso (5,09 effettivo): ok ma senza margine; non scendere sotto opacità 0,7. `src/components/foodclub/FoodClub.css` (`.fc-voucher--used`).
- P2 — Nota ambiente, non difetto di prodotto: "Annulla ordine" da staff non funziona sul dev Vite (api/ 404); il rilascio del buono è verificato solo a livello trigger DB, non end-to-end con l'API. Da ripetere con `vercel dev` o in preview.
- P0/P1: nessuno.

## Screenshot (cartella `$W/ai-ops/reports/food-club-ux-shots/`)
- PRIMA (`prima/`): 01-checkout-buono, 01b-checkout-senza-buono, 02-premio-conquistato, 03-staff-panoramica, 04-tessera-nuovo-giro, 04b-buoni, 04c-tessera-zero.
- DOPO (`dopo/`): stessi nomi (04c = tessera 1/2) + 01c-checkout-focus, 02b-premio-ricarica, 02c-premio-reduced-motion, 03b-staff-altre-statistiche, 03c-staff-summary-focus, 04b2-buoni-usati, 04d-buono-riservato, 04d-buono-riservato-buoni, 04e-stato-ordine-riservato, 04f-buono-rilasciato, 04f-tessera-rilasciato.

## Stato DB locale lasciato
- Buono di 3330000002 (id 39a1dd8f…): `available`, nessun ordine collegato, scadenza 2026-12-05.
- Ordine A08 (Test UX, 8,90): `cancelled` (via SQL locale). Nessun pagamento creato.
- Contatori staff: "SMS inviato" +3 per i login di test.
