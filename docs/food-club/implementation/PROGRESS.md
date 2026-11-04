# Food Club V1 — PROGRESS

Branch `feat/food-club-v1` (locale). Legenda stato: **IMPLEMENTATO E VERIFICATO** · **IMPLEMENTATO MA NON VERIFICABILE QUI** ·
**PARZIALE** · **BLOCCATO** · **NON INIZIATO**.

## Fasi
| Fase | Stato | Note |
|---|---|---|
| F0 Ricognizione | FATTA | branch/commit verificati; base = docs/food-club-pwa + merge origin/main (fix #13); Postgres 16 nativo con shim Supabase (Docker senza daemon) |
| F1 Base dati e regole | IMPLEMENTATO E VERIFICATO (locale) | migration `20261105100000`; 25 scenari SQL + 4 concorrenza |
| F2 Ordini e pagamenti | IMPLEMENTATO E VERIFICATO (locale) | migration `20261105101000`; trigger su paid/annullo/abbandono/rimborso, v4 con buono, guardia importi |
| F3 Identità e privacy | DB: IMPLEMENTATO E VERIFICATO (locale) · OTP reale: NON VERIFICABILE QUI | migration `20261105102000`; hook OTP client; provider Phone/SMS mai attivato |
| F4 Esperienza cliente | IN CORSO | pagine Club, integrazione menu/sacco/stato ordine |
| F5 Staff | IN CORSO | pagina /kitchen/club-staff, badge Solo, fine servizio |
| F6 PWA e notifiche | IN CORSO | manifest/icone/SW, coda + regole in DB, Edge Function (file, mai deploy) |
| F7 Analytics | DB: IMPLEMENTATO E VERIFICATO (locale) | `food_club_staff_overview` descrittiva + eventi interni deduplicati |
| F8 Qualità finale | NON INIZIATO | |

## Problemi incontrati
- Docker presente ma senza daemon: niente stack Supabase locale. Soluzione equivalente: Postgres 16 nativo + `tests/db/supabase-shim.sql` (ruoli, `auth.uid()` da `request.jwt.claims`, stub pg_cron/pg_net/vault). Limiti: niente GoTrue (OTP), niente PostgREST/Realtime, niente Edge Functions.
- Baseline `origin/main` ha già 9 test statici di migration e 5 unit falliti (+1 flaky `sumup-refund-reliability`), e 121 problemi lint: preesistenti, non introdotti qui.

## Prossima attività
Integrazione dei lavori UI (4 subagent), build/lint/test, verifica visuale 390/430 e staff desktop, commit.
