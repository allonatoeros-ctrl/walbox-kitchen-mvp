# Food Club V1 — PROGRESS

Branch `feat/food-club-v1` (solo locale, non pubblicato). Stati: **IMPLEMENTATO E VERIFICATO** (qui, in locale) ·
**IMPLEMENTATO MA NON VERIFICABILE QUI** · **PARZIALE** · **BLOCCATO** · **NON INIZIATO**.
Niente di questo è in produzione: migration non applicate, nessun deploy, flag `VITE_FOOD_CLUB_ENABLED` assente = Club invisibile.

## Matrice F1–F8
| Fase | Stato | Cosa c'è |
|---|---|---|
| F0 Ricognizione | FATTA | branch, decisioni, strumenti (Postgres nativo + shim; niente Docker/GoTrue/Deno) |
| F1 Base dati e regole | IMPLEMENTATO E VERIFICATO | `20261105100000`: food autorevole, `source`, campagne, tessere, timbri, buoni, inviti, messaggi, eventi, RLS |
| F2 Ordini e pagamenti | IMPLEMENTATO E VERIFICATO (+ patch di revisione proposta: P1 doppio uso buono, vedi REVIEW-2026-11-04) | `20261105101000`: v4 con riserva, consumo su paid+charge, rilascio su annullo/abbandono, rimborso, guardia importi, concorrenza |
| F3 Identità e privacy | PARZIALE | DB verificato (join, consensi, biglietto legato al numero, uscita); client OTP scritto ma OTP reale NON VERIFICABILE QUI; "Confirm phone" in produzione = **BLOCCATO** (gate Eros) |
| F4 Esperienza cliente | IMPLEMENTATO E VERIFICATO (mock) | pagine `/kitchen/club/*`, striscia menu, buono e timbro nel sacco, card stato ordine; verificato a 390/430 con RPC mock, non su Supabase reale |
| F5 Staff | IMPLEMENTATO E VERIFICATO (mock) | `/kitchen/club-staff` (6 tab), badge BUONO/DA INCASSARE in Solo, banner da pagare |
| F6 PWA e notifiche | PARZIALE | manifest/icone/SW, inviti per piattaforma, coda e regole in DB verificate; Edge Function solo file; push reali e installazione reale NON VERIFICABILI QUI |
| F7 Analytics | IMPLEMENTATO E VERIFICATO | `20261105103000`: panoramica descrittiva, funnel, PWA, notifiche, anomalie; nessun dato sintetico |
| F8 Qualità | FATTA (con limiti) | vedi TEST-MATRIX; E2E esistenti non conclusivi in questo ambiente |

## Matrice I-1…I-7 (PWA-NOTIFICHE-spec §7)
| Passo | Stato |
|---|---|
| I-1 prefs/log notifiche, touch, eventi | IMPLEMENTATO E VERIFICATO (`food_club_messages`, `food_club_events`, consensi su `food_club_members`, riclaim = touch) |
| I-2 riclaim al cambio uid, bentornato, esci dal telefono | IMPLEMENTATO; riclaim/bentornato non provati su telefono |
| I-3 installInvite + guide + card | IMPLEMENTATO E VERIFICATO (unit + screenshot) |
| I-4 manifest/icone/SW all'avvio | IMPLEMENTATO E VERIFICATO (headless); installazione reale da provare |
| I-5 Edge Function + coda + job | Edge Function: IMPLEMENTATO MA NON VERIFICABILE QUI; job pg_cron push NON schedulato (serve Vault: gate Eros) |
| I-6 viste aggregate | IMPLEMENTATO E VERIFICATO |
| I-7 prova reale push "ordine pronto" | NON INIZIATO (serve telefono: Eros) |

## Problemi incontrati
- Docker senza daemon → Postgres nativo + shim (limiti: niente GoTrue, PostgREST, Realtime, Edge Functions).
- Baseline `origin/main`: 5 unit + 9 statici falliti, 121 problemi lint, 1 unit flaky: preesistenti.
- E2E Playwright esistenti rossi anche sul codice di partenza in questo ambiente (race `goto('/')` → `/kitchen`, sezioni dipendenti dall'orario).
- Le icone PWA derivano da `favicon.svg` (fulmine viola, non il Walrus): da decidere con D-22.

## Revisione 2026-11-04
Stack Supabase locale vero (Docker): migration, RLS, OTP reale, checkout on/off, regressione `main`, PWA: verdi.
1 P1 + 4 P2 SQL corretti in `proposed/20261105104000_food_club_v1_review_fixes.sql` (NON in `supabase/migrations/`,
area protetta: da adottare con gate). Dettagli: `REVIEW-2026-11-04.md`.

## Prossima attività
Gate di Eros: decisioni aperte (DECISIONS.md), poi prova su Supabase locale vero sul Mac (`e2e-real-local`) delle 4 migration.
