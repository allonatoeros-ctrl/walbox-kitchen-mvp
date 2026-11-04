# Food Club V1 — TEST MATRIX

Ambiente: container cloud, Postgres 16 nativo + shim Supabase (`tests/db/supabase-shim.sql`), Chromium headless.
Nessun test su Supabase reale (né remoto né stack locale: Docker senza daemon), nessun telefono reale.
Risultato: **PASS** · **FAIL** · **NON ESEGUITO** (con motivo).

## Regole economiche e temporali (tests/db/food-club/10_rules_payments.sql)
| Requisito | Test | Risultato | Evidenza |
|---|---|---|---|
| Food autorevole lato server, bevande escluse, MENU con quota | T01 | PASS | food 8 € con 2 birre; MENU birra = 13 |
| Ordini staff esclusi; `source` immutabile | T02, T03 | PASS | source='staff', nessun timbro; UPDATE source rifiutato |
| 2 serate diverse entro 30 gg → buono 5 €, validità 30 gg, 1 timbro/serata | T04 | PASS | 2 timbri, buono available 5/12, scadenza now+30gg |
| Finestra 30 gg scaduta → tessera riparte; confine 29g23h dentro | T05, T05b | PASS | |
| Soglia 10 € di food (esatti = timbro) | T06 | PASS | |
| Non iscritto / campagna spenta / consegnato non pagato | T07 | PASS | nessun timbro |
| Buono: riserva alla creazione, totale scontato, consumo al pagamento online; riuso rifiutato | T08 | PASS | total 8,90, SumUp 8,90, status used |
| Buono rifiutato sotto 12 € di food: nessun ordine creato | T08 | PASS | conteggio ordini invariato |
| Annullo staff → rilascio con scadenza originale, totale non riscritto, riuso | T09 | PASS | |
| Abbandono online 5 min → rilascio (scaduto se oltre scadenza) | T10 | PASS | |
| RISERVATO non scade; pagato dopo scadenza → usato | T11 | PASS | |
| Scadenza disponibile → SCADUTO, non usabile | T12 | PASS | |
| Guardia importi su ordini con buono; ordini senza buono invariati | T13 | PASS | |
| Buono di un altro / senza client_request_id | T14 | PASS | |
| Retry idempotente v4 (stesso client_request_id) | T15 | PASS | sconto unico |
| Rimborso: timbro revocato, buono non usato revocato, tessera riaperta; D-2 configurabile | T16, T16b/c | PASS | |
| 'paid' senza charge: niente timbro, buono resta riservato, anomalia | T17 | PASS | |
| Pagamento SumUp tardivo dopo annullo | T18 | PASS | ordine non pagato, riconciliazione manuale |
| Online → paga al banco con buono | T19 | PASS | banco incassa 8,90 |
| Inviti spenti di default; acceso: premio, 1 per invitato, tetto 5/30 gg | T20 | PASS | |
| Serata 06:00 Europe/Rome (anche ora legale), mezzanotte | T21, T22 | PASS | |
| D-3 configurabile | T23 | PASS | |

## Concorrenza (tests/db/food-club-concurrency.test.mjs, sessioni psql parallele)
| Requisito | Test | Risultato |
|---|---|---|
| Stesso buono su 2 ordini in parallelo: 1 solo passa, nessun ordine orfano | C1 | PASS |
| Webhook duplicati concorrenti: 1 consumo, 1 timbro, 1 charge | C2 | PASS |
| Annullo staff vs conferma pagamento in corsa: stato finale coerente (4 giri) | C3 | PASS |
| Due ordini pagati in parallelo stessa serata: 1 timbro | C4 | PASS |

## Identità, consensi (20_identity_consent.sql)
| Requisito | Test | Risultato | Nota |
|---|---|---|---|
| Iscrizione solo con telefono verificato | I01 | PASS | simulato con `phone_confirmed_at` |
| Consensi servizio/marketing separati, tracciati, revoca | I02 | PASS | |
| Anonimo → iscritto stesso uid; D-13 configurabile | I03, I03b | PASS | |
| Secondo dispositivo: biglietto legato al numero (P4), replay, furto | I04 | PASS | |
| Biglietto scaduto / sessione non anonima | I05 | PASS | |
| Inviti: codice, spenti, benvenuto | I06 | PASS | |
| Uscita dal Club | I07 | PASS | |
| OTP SMS reale, Confirm phone, cambio uid in GoTrue | — | NON ESEGUITO | nessun GoTrue/provider SMS qui (vietato attivarlo) |

## RLS e permessi (30_rls_staff.sql)
| Requisito | Test | Risultato |
|---|---|---|
| Cliente vede solo il suo, nessuna scrittura, niente funzioni interne/staff | R01 | PASS |
| anon: solo campagna pubblica | R02 | PASS |
| Staff: nessuna tabella diretta, telefoni mascherati, manager per campagne | R03, R04 | PASS |
| Badge comanda e fine servizio | R05 | PASS |
| Grant EXECUTE / RLS su tutte le tabelle | R06 | PASS |

## Notifiche (40_notifications.sql + unit)
| Requisito | Test | Risultato |
|---|---|---|
| Sottoscrizioni 'order' mai usate per Club | N01 | PASS |
| Tocco ATTIVA = consenso tessera; tetto 1/giorno | N02 | PASS |
| Promo solo con marketing; endpoint 410 rimosso | N03 | PASS |
| Claim solo service_role; eventi deduplicati | N04, N05 | PASS |
| Edge Function logica pura | `supabase/functions/send-food-club-push/logic.test.js` | PASS |
| Manifest/icone/SW | `tests/unit/food-club-pwa-assets.test.mjs`, f6-webpush-* | PASS |
| Manifest valido per Chrome (CDP getAppManifest/installability) | verifica subagent | PASS (headless) |
| Push reale iPhone/Android, installazione reale | — | NON ESEGUITO (serve dispositivo) |
| `index.ts` della Edge Function | — | NON ESEGUITO (Deno assente) |

## Frontend
| Requisito | Test | Risultato | Evidenza |
|---|---|---|---|
| Regole client (food, buono nel carrello, previsione timbro, telefono) | `src/lib/foodClubRules.test.js` | PASS (7) | |
| Inviti installazione per piattaforma/contesto | `src/lib/installInvite.test.js` | PASS (10) | |
| Lint file Club | eslint | PASS (0) | totale repo 121 = baseline |
| Build flag spento / acceso | vite build | PASS | |
| Flag spento: nessuna chiamata Club, rotte Club non raggiungibili | Playwright su build | PASS | 0 chiamate food_club |
| Pagine cliente 390/430, overflow 0, console 0 | Playwright con RPC mock | PASS | screenshot subagent (scratchpad) |
| Sacco: PAGO ORA/AL BANCO nel viewport col Club | Playwright 390×844 / 430×932 | PASS | |
| Errore buono → retry senza buono, stesso client_request_id | script con RPC mock | PASS | |
| Pagamento SumUp usa il totale del server (scontato) | lettura codice | PASS | `CustomerKitchenMenu.jsx` payableTotal = createdOrder.total |
| Staff 1280×800, tab, manager_only, errore RPC → niente banner | Playwright mock (spec fuori repo) | PASS | |
| Unit esistenti | node --test | 606/612; 5 FAIL preesistenti identici al baseline origin/main (+1 flaky refund) |
| Test statici migration | node --test | 428/438; 9 FAIL preesistenti identici al baseline |
| E2E esistenti (customer flow, notification gate, solo service) | Playwright | NON CONCLUSIVO | rossi anche su origin/main in questo ambiente (race di navigazione `goto('/')`→`/kitchen`, orario del servizio) |
| E2E reali (OrbStack) | `scripts/e2e-real-supabase-local.sh` | NON ESEGUITO | Docker senza daemon |
| Mobile reale / tablet reale | — | NON ESEGUITO | |

## Revisione 2026-11-04 — stack Supabase locale VERO (Docker), dettagli in `REVIEW-2026-11-04.md`
| Requisito | Test | Risultato |
|---|---|---|
| 121 migration su Supabase reale (`supabase start` / `db reset`) | CLI 3.0.0, Postgres 17 | PASS |
| 44 scenari SQL + 4 concorrenza su Postgres Supabase vero | `tests/db/*` | PASS (con e senza patch) |
| Permessi con default privileges Supabase (EXECUTE, tabelle, RLS, search_path) | `has_function_privilege` / `has_table_privilege` | PASS |
| Doppio uso buono via abbandono + pagamento tardivo (P1) | `proposed/50_review_fixes.sql` RF1/RF1b | FAIL senza patch → PASS con patch |
| Buono riservato su `paid` manuale + charge tardivo; rimborso invito; FK; combo | RF2–RF5 | FAIL senza patch → PASS con patch |
| OTP reale GoTrue (test_otp), stesso uid, unione secondo dispositivo | `proposed/harness/fc-http.mjs` | PASS (Confirm phone ON) |
| Confirm phone OFF → numero confermato senza OTP, join possibile | idem | RISCHIO DIMOSTRATO (gate produzione) |
| Abusi HTTP: buono altrui, tabelle, funzioni interne, RPC staff, totale, importo SumUp | idem | PASS |
| Checkout browser flag spento (0 chiamate Club) / acceso (OTP da UI, buono, 8,90 €) | `proposed/harness/fc-checkout.cjs` | PASS 6/6 · 8/8 |
| Frontend `origin/main` su DB con migration Food Club + patch (ordine + banco) | idem, porta 5183 | PASS |
| PWA build prod: SW, manifest, installabilità; push Club al SW → notifica; push ordine invariata | `proposed/harness/fc-pwa.mjs` (CDP) | PASS |
| `send-food-club-push/index.ts` eseguita | edge-runtime locale | NON ESEGUITO: proxy TLS del cloud (ambiente), harness pronto per il Mac |
