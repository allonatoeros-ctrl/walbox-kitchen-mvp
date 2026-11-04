# Food Club V1 — Decisioni

Legenda: **APPROVATA** (fonte nei documenti) · **ASSUNZIONE TECNICA** (scelta mia, reversibile) · **APERTA** (serve Eros:
implementata come configurazione prudente o spenta, mai presentata come approvata).

## Approvate (fonte)
| Regola | Fonte | Implementazione |
|---|---|---|
| Iscrizione gratuita con telefono verificato (OTP) | mandato, F0 §3, D-6 chiusa | `food_club_join` richiede sessione non anonima con `phone_confirmed_at` |
| ≥10 € di food pagato = 1 timbro, bevande escluse | mandato, D-9 chiusa | `food_unit_amount` server; soglia `stamp_min_food=10` |
| Max 1 timbro per serata (06:00→06:00 Europe/Rome) | mandato, FASE3 §1 | indice unico `(user_id, service_night)` + `food_club_service_night()` |
| 2 serate diverse entro 30 giorni dalla prima visita valida | mandato, D-9 | tessera `expires_at = prima visita + 30 gg`; scaduta → riparte |
| Buono 5 €, valido 30 gg, uso con ≥12 € di food su ordine successivo, 1 per ordine, non cumulabile | mandato, FASE3 §1 | `voucher_value/min_food/valid_days`; guardia + rifiuto se promo |
| Ordini app validi online e al banco solo dopo pagamento confermato | mandato | trigger su `payment_status→paid` + charge `succeeded` con importo = totale |
| Ordini creati dallo staff esclusi | mandato, F0 §4 chiusa | colonna `source` scritta da trigger in base a `kitchen_staff_members` |
| Nessun doppio uso | F0 §4 chiusa | lock + indici unici + test concorrenza C1–C4 |
| Stati buono DISPONIBILE/RISERVATO/UTILIZZATO/RILASCIATO/SCADUTO e invarianti | FASE3 §3.1 | tabella + guardia transizioni + trigger |
| Notifiche: permesso solo con gesto esplicito; promo solo con consenso marketing valido all'invio | PWA spec §2.2, §4.1 | `food_club_push_subscribe(scope club)`; claim batch |
| Sottoscrizioni col vecchio testo "niente pubblicità" mai usate per Club/promo | PWA spec R5 | `consent_scope='order'` di default |

## Assunzioni tecniche
| ID | Assunzione | Motivo |
|---|---|---|
| A-1 | Il Club si aggancia con **trigger** su `kitchen_orders` invece di riscrivere le RPC di pagamento | copre tutti i percorsi (RPC, API, UPDATE staff) nella stessa transazione; nessuna modifica a `api/` |
| A-2 | Un errore del Club nel trigger "pagato" non fa mai fallire il pagamento: log `food_club_error`, buono resta RISERVATO | i soldi vincono; stato sicuro (buono non riusabile) |
| A-3 | Voce di menu non classificata = 0 € di food | mai timbri per errore |
| A-4 | MENU combo: food = prezzo − listino bevanda inclusa (birra 6, bibita 4) | prudente; con qualunque scelta D-5 ogni MENU supera già 10 € e 12 € |
| A-5 | `source='staff'` se chi crea è in `kitchen_staff_members` (qualunque RPC) | segnale server non falsificabile dal client |
| A-6 | Un 'paid' senza charge riuscito (UPDATE manuale) non dà timbro né consuma il buono | audit §1.4 |
| A-7 | Campagna `visite-v1` creata **spenta**; accensione solo manager (`food_club_admin_set_campaign_active`) | lancio = decisione di Eros |
| A-8 | Lo sconto entra in `total` alla creazione (v4), prima di ogni tentativo di pagamento; minimo 0,50 € da pagare | SumUp/banco leggono `total` |
| A-9 | Telefono: in DB solo hash (`phone_hash`) nel Club; allo staff solo ultime 3 cifre | minimizzazione |
| A-10 | Daily cap notifiche: 1 push Club per utente ogni 20 h; timbro più vecchio di 12 h non inviato | spec §4.2 (D-19 proposta) |

## Aperte (NEEDS_DECISION) — come sono configurate oggi
| ID | Tema | Stato nel codice |
|---|---|---|
| D-1 | PCP mai pagato a fine serata | nessun rilascio automatico; pannello "da pagare" + anomalia contata |
| D-2 | Buono usato su ordine poi rimborsato | `refund_recredits_voucher=false` (resta usato) |
| D-3 | Ordine col buono dà timbro? | `stamp_on_voucher_order=true`, food prima dello sconto (proposta del piano, prototipo v3 mostra "TIMBRO IN ARRIVO") |
| D-4 | Timbro di benvenuto | `welcome_stamp_enabled=false` |
| D-5 | MENU nella soglia | A-4 (quota food prudente) |
| D-7 | Serata del timbro | `created_at` (proposta) |
| D-8/D-21 | Misura causale / gruppo controllo | solo indicatori descrittivi; nessun gruppo di controllo |
| D-10/D-16 | Fornitore SMS e budget | nulla attivato |
| D-11 | Testi legali / informativa | bozza in app marcata "da validare" |
| D-13 | Timbri retroattivi | `retroactive_days=0` (spento) |
| D-14 | Porta un amico in V1 | implementato, `referral_enabled=false` |
| D-15 | Cambio numero | nessun self-service; `phone_already_member` → staff |
| D-17 | Accesso PWA iPhone | nuovo OTP SMS (proposta) |
| D-18 | Avvisi tessera attivati dal tocco ATTIVA | implementato così (da validare col legale) |
| D-19 | Limiti frequenza / fascia silenziosa | valori proposti della spec |
| D-20 | Titolo card notifiche senza buono | variante per stato |
| D-22 | Nome sotto l'icona | invariato "Walbox Kitchen" |
| P1 F0 | "Confirm phone" in produzione | **bloccante** per il lancio, non verificabile da qui |

## Aggiunte durante l'implementazione UI (assunzioni, da confermare)
| ID | Assunzione |
|---|---|
| A-11 | Buono nel sacco NON applicato di default: il cliente lo attiva con un tocco |
| A-12 | Se il server rifiuta il buono, l'ordine non nasce: si toglie il buono e il cliente riprova senza (stesso `client_request_id`) |
| A-13 | Push Club con TTL 12 h nella Edge Function |
| A-14 | Club dietro `VITE_FOOD_CLUB_ENABLED` + campagna attiva: con flag spento nessuna chiamata Club (verificato) |
| A-15 | Icone PWA generate da `favicon.svg` (fulmine viola): estetica da decidere con D-22 |
| A-16 | Banner Solo "ordini da pagare" con controllo ogni 60 s (solo flag acceso) |
