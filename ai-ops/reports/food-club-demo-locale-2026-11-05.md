# Food Club V1 — Demo interna locale (2026-11-05)

**Verdetto: PASS per la demo locale, con 1 simulazione dichiarata e 1 difetto UX.**
Worktree `walbox-food-club-v1`, branch `food-club-v1-p1` @ `a58c7ef`. Nessun file del repo modificato (solo questo report,
gitignored). Nessun commit/push/deploy, nessun accesso alla produzione, nessun SumUp/SMS/push reale.
Legenda: [V] verificato (UI + DB locale) · [S] simulato · [D] dedotto.

## Ambiente
- Stack Supabase locale `walbox-fc-demo` (127.0.0.1:54321 API, :54322 DB). Copia di config e migration in
  `scratchpad/demo/stack/` (sessione 5445bde8): `supabase/config.toml` del repo non toccato.
- Migration: le 74 del branch + `proposed/20261105104000_food_club_v1_review_fixes.sql` (cambia proprio timbro e
  buono pagato, quindi rende la demo uguale a ciò che si vuole rilasciare). NON applicate 105000 (Opzione C, checkout
  SumUp) e 106000 (rimborsi): con il pagamento al banco non entrano in gioco.
- Solo nella copia locale: SMS di test (+39 333 000 000 1/2/3, codice 123456, Twilio finto), conferma telefono attiva.
- Solo nel DB locale: campagna `visite-v1` attivata; utente staff manager di test (credenziali in
  `scratchpad/demo/staff.env`, valori solo locali).
- App: Vite dev su 127.0.0.1:5190 con `VITE_FOOD_CLUB_ENABLED=true` e URL/chiave del DB locale. Edge runtime spento.

## Pagamento simulato
"Pago al banco" dal checkout cliente + "CONFERMA PAGAMENTO" dello staff in `/kitchen/solo` (RPC
`kitchen_payment_record_counter`): crea un charge `succeeded` metodo cash nel DB locale. È il percorso reale del banco,
senza provider. 0 righe SumUp in `kitchen_payments` [V].

## Esito percorso
| Passo | Esito | Evidenza |
|---|---|---|
| 1 Iscrizione OTP (+39 3330000001) | PASS [V] | tessera creata, "Demo Tricheco" |
| 2 Ordine 1 Brisket 15 € → timbro 1 | PASS [V] | paid/cash, stamp serata 05/11 |
| 3 Ordine 2 Pastrami 14,50 € altra serata → timbro 2 | PASS [V]+[S] | serata diversa SIMULATA spostando indietro di 1 giorno ordine 1 e timbro 1 nel DB locale |
| 4 Buono 5 € automatico | PASS [V] | WC-DCVKLK, min 12 €, scade 05/12 |
| 5 Ordine 3 Pulled Pork 13,90 € con buono → 8,90 € | PASS [V] | discount 5, buono reserved → used su ordine 3, nessun timbro (stessa serata) |
| 6 Buono usato una sola volta | PASS [V] | non compare più nel sacco; RPC v4 con lo stesso buono → `voucher_not_available` |
| 7 Tessera cliente e panoramica staff | PARZIALE [V] | staff ok (1 iscritto, 2 visite, 1 buono usato, 5 € sconti, 3 notifiche in coda 0 inviate); tessera: vedi difetto |

## Difetti trovati (non corretti: stanno in una migration, area protetta)
- **UX-1:** dopo l'emissione del buono la tessera cliente torna a "0 visite su 2 / Ancora nessuna visita" e la scheda
  staff ISCRITTI mostra "TIMBRI 0". Causa [D]: la carta passa a `completed` e la vista legge solo la carta `open`
  (`supabase/migrations/20261105102000_food_club_v1_identity_api.sql` ~r.309). Il buono resta visibile. Per la demo
  non blocca, ma il cliente non vede le 2 visite piene.
- Dopo l'uso del buono la tessera non mostra traccia del buono usato [D].
- Console: un 422 su `/auth/v1/user` durante il login OTP, senza effetti.

## File fuori scopo lasciati dal collaudo (da togliere a mano)
`walbox-kitchen-release/tessera2.png` e `walbox-kitchen-release/.playwright-mcp/` (screenshot del subagent Playwright).

## Aggiornamento: correzione UX tessera (UX-1) — PASS in locale
- Causa [V]: `food_club_my_state()` e `food_club_staff_members()` leggevano solo la card `open`; dopo il 2° timbro la card
  è `completed` e la nuova nasce al timbro successivo → card nulla → "0 visite".
- SQL proposta (solo lettura + stessi GRANT): `proposed/20261105107000_food_club_v1_card_display.sql` (`last_completed_card`,
  `totals`; staff: `cycle_stamps`, `cycle_completed`, `total_visits`). Test `proposed/54_card_display.sql` CD0–CD4 PASS [V].
  Applicata SOLO al DB locale demo. Non è in `supabase/migrations/`.
- Client: `src/lib/foodClubRules.js` (+test, 12/12), `StampCard.jsx`, `clubText.js`, `ClubMenuStrip.jsx`, `FoodClubPage.jsx`,
  `FoodClubStaffPage.jsx`. Compatibile con il DB senza la SQL nuova (visto: tessera come prima, nessun errore). Lint 0 errori nei file toccati.
- Visti a 390: 0/2, 1/2, 2/2 "premio conquistato", premio usato nello storico, "nuovo giro 1/2", staff "GIRO ATTUALE"/"VISITE TOTALI".
  Screenshot: `scratchpad/demo/shots-ux/` (sessione 5445bde8).
- Non visto a video: buono `reserved` (solo test SQL/unit), buono scaduto (solo unit).
- NEEDS_DECISION: dopo l'uso del premio la tessera mostra 0/2 "Premio incassato. Si riparte!" (non 2/2).
