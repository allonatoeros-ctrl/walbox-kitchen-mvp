# WALRUS FOOD CLUB V1 — Fase 3: regole, stati, piano tecnico

_2026-11-04 · base codice `origin/main` 595f639 · analisi in sola lettura, dettaglio con file:riga in `audit-codice.md`_
_Nessuna modifica al repo Walbox, nessuna migration, nessun commit/push/deploy._
Legenda: **V** = verificato nel codice · **D** = dedotto/proposta · **[P]** = area protetta (CLAUDE.md §5).

---

## 1. Regole commerciali consolidate

| Tema | Regola | Note |
|---|---|---|
| Ambito | Solo Walrus Melegnano, solo food. | Confermare che `walrus-main` = Melegnano. |
| Iscrizione | Gratuita, telefono verificato via SMS (solo codice OTP in V1). | Push promozionali solo con consenso marketing. |
| Ordini validi | Solo ordini **creati dal cliente su Walbox**, pagati online o al banco. Esclusi gli ordini creati dallo staff. | Oggi il server non distingue i due casi (V): serve una colonna `source` (§4.4). |
| Timbro (mese 1) | 1 timbro per ordine **pagato** con food ≥ 10 €. | Al massimo 1 timbro per serata. |
| Tessera | 2 timbri in **2 serate diverse** entro **30 giorni dalla prima visita valida**. | Serata = 06:00→06:00, Europe/Rome. Finestra scaduta con 1 timbro: la tessera riparte dalla visita successiva. |
| Buono | 2 timbri = buono 5 €, valido 30 giorni dallo sblocco. | |
| Uso del buono | Su un **successivo** ordine Walbox con food ≥ 12 €. Max 1 buono per ordine, non cumulabile (niente Promo Pass sullo stesso ordine). | 12 € da approvare economicamente col locale prima del lancio. |
| Ordine col buono | Genera comunque un timbro se ha food ≥ 10 €. | **NEEDS_DECISION D-3**: proposta sì; soglia calcolata sul food prima dello sconto. |
| Campagna mese 2 | "Spendi in totale 50 € di food → 5 €". Mai attiva insieme alla campagna visite. | Premi già ottenuti restano validi. Timbri parziali del mese 1 non convertiti (D). |
| Porta un amico | Invitante: buono 5 € quando l'amico completa il **primo** ordine food valido ≥ 10 €. Invitato: 1 timbro di benvenuto (col primo ordine valido completa la tessera → buono per la volta dopo). | Solo nuovi iscritti con telefono mai registrato. No auto-invito. Max 5 premi da invito / 30 giorni per invitante. |
| Timbro di benvenuto | Apre la finestra dei 30 giorni dall'iscrizione. Il primo ordine valido completa la tessera anche se è nella stessa serata dell'iscrizione. | **NEEDS_DECISION D-4** (proposta). |

Dati reali già verificati da Eros (non ripetuti): 657 ordini con food, food ≥ 10 € = 66,7 %, ≥ 12 € = 55,9 %, mediana 13,90 €.
Ordini creati dallo staff 496 su 720: la leva vera è spostare clienti sull'ordine autonomo.

---

## 2. Stato attuale del codice rilevante (sintesi audit)

- **Stati ordine (V):** `status` ∈ pending_counter_payment (PCP), pending_online_payment (POP), payment_abandoned (PA),
  received, preparing, ready, delivered, cancelled. "Pagato" **non è uno status**: è `payment_status = paid` + `paid_at`.
  Un PCP può avanzare fino a `delivered` senza essere pagato.
- **Totale e SumUp (V):** il totale lo calcola il server dal catalogo; l'importo SumUp = `order.total`, controllato in
  più punti. Il cliente non può manipolarlo. **Lo staff sì** (RLS permette UPDATE di ogni colonna di `kitchen_orders`).
- **Conferma pagamento (V):** atomica e idempotente (FOR UPDATE, indice unico sul charge riuscito, replay no-op).
  Conferme manuali staff (contanti, carta a mano) con `record_counter`, anche questa con lock.
- **Abbandono (V):** solo POP, dopo 5 min (cron). **Un PCP mai pagato resta aperto all'infinito** finché lo staff annulla.
- **Annullo (V):** solo staff, rifiutato se l'ordine è pagato. **Rimborso (V):** solo totale, `payment_status = refunded`.
- **Categoria food (V):** il server **non** la conosce: vive nel client (`kitchenMockData.js` [P]). I MENU
  (item-040/041/042/060/061/062) sono food+bevanda a prezzo unico.
- **Precedente utile (V):** il Promo Pass usa `discount_amount` e un consumo atomico `WHERE status='issued'`, ma **non
  viene mai rilasciato** su annullo o rimborso: non va copiato così.
- **Identità (V):** cliente anonimo (Supabase Anonymous Auth), ordini legati a `customer_id = auth.uid()` via RLS.
  `order_code` (es. A07) **non è segreto né unico nel tempo**. Le push sono legate al `customer_id`.
- **Serata (V):** lato server `service_day` = data di calendario; la serata 06:00 esiste solo nel client.
- **Da verificare in lettura prima di F1:** le migration `20261028121000` (v3) e `20261030140000` (retention privacy) sono
  marcate "LOCAL BUILD ONLY": non è noto se siano in produzione (`npx supabase migration list --linked`).

---

## 3. Specifica degli stati: ordine × buono

### 3.1 Buono

| Stato | Significato | Entra da | Esce verso |
|---|---|---|---|
| **DISPONIBILE** | Sbloccato, usabile entro `expires_at`. | sblocco tessera / premio invito / RILASCIATO | RISERVATO, SCADUTO |
| **RISERVATO** | Legato a **un** ordine (`reserved_order_id`), sconto già dentro `order.total`. | creazione ordine cliente con buono | UTILIZZATO, RILASCIATO |
| **UTILIZZATO** | Ordine pagato. Definitivo. | conferma pagamento (online o banco) | (solo D-2: riaccredito su rimborso) |
| **RILASCIATO** | Evento, non stato di riposo: l'ordine è chiuso **definitivamente non pagato**; il buono torna DISPONIBILE con la **scadenza originale**, o SCADUTO se nel frattempo è passata. | annullo non pagato / PA | DISPONIBILE o SCADUTO (nella stessa transazione) |
| **SCADUTO** | `now() > expires_at` e non riservato. Definitivo. | DISPONIBILE | — |

Regole invarianti:
1. **Un buono RISERVATO non scade mai mentre è riservato**: se l'ordine viene pagato dopo `expires_at`, il buono diventa
   UTILIZZATO (lo sconto è già stato promesso al cliente). Scade solo dopo un eventuale rilascio.
2. **Nessun rilascio a orario fisso** (es. 06:00) finché l'ordine è pagabile. Il rilascio avviene **solo nella stessa
   transazione** che porta l'ordine in `cancelled` o `payment_abandoned` senza pagamento.
3. Al massimo un buono per ordine (indice unico su `reserved_order_id`) e al massimo un ordine per buono (riga unica).
4. Ogni transizione è un `UPDATE ... WHERE id = ? AND status = <atteso>` + riga in `food_club_voucher_events`
   (storico), idempotente: ripetere la stessa chiamata non cambia nulla.
5. Le tabelle Club sono scrivibili **solo** da funzioni `SECURITY DEFINER`; nessun UPDATE diretto per staff o cliente.

### 3.2 Matrice transizioni ordine → effetto su buono e timbro

| Evento sull'ordine | Chi/dove (oggi) | Buono | Timbro / premio invito |
|---|---|---|---|
| Creazione ordine cliente **con buono** (PCP o POP) | nuova RPC cliente v4 | DISPONIBILE → RISERVATO; `total` già scontato **prima** di qualsiasi tentativo SumUp | — |
| POP → paid (webhook/reconcile/confirm) | `kitchen_payment_confirm` | RISERVATO → UTILIZZATO **nella stessa transazione** | timbro se food ≥ 10 € e ordine cliente; eventuale premio invito |
| PCP → paid (contanti / carta a mano / SumUp al banco) | `record_counter` / confirm | RISERVATO → UTILIZZATO, stessa transazione | come sopra |
| POP → payment_abandoned (5 min) | `mark_payment_abandoned` | RISERVATO → RILASCIATO → DISPONIBILE/SCADUTO | — |
| POP → PCP (cliente sceglie "paga al banco") | trigger esistente | resta RISERVATO (stesso ordine, stesso totale) | — |
| PCP/POP → cancelled non pagato | `cancel_with_payment_attempt` | RISERVATO → RILASCIATO | — |
| Ordine pagato → refunded | API refund | UTILIZZATO resta tale (**D-2**: proposta riaccredito DISPONIBILE con scadenza originale) | timbro revocato; se il timbro aveva già prodotto un buono non usato, il buono si revoca; se già usato, si tiene (D11 Fase 2) |
| PCP fino a `delivered` **senza** paid | staff UPDATE | **resta RISERVATO** (delivered non è prova di pagamento) | nessun timbro |
| Fine serata con PCP ancora da pagare | — (oggi nulla) | resta RISERVATO fino a decisione staff (§3.3) | — |
| Pagamento SumUp arrivato **dopo** PA/annullo | registro `needs_manual_reconciliation` (V) | il buono era già rilasciato: segnalato nella riconciliazione come "buono già rilasciato" | nessun timbro automatico; lo staff decide |

### 3.3 Controllo di fine servizio (ordini "da pagare")

Obiettivo: chiudere ogni PCP aperto **con una decisione esplicita dello staff**, senza liberare buoni su ordini pagabili.

1. **Pannello "Fine servizio — ordini da pagare"** sul tablet (Solo Service): elenca i PCP non pagati della serata,
   con totale scontato e badge "BUONO −5 €". Per ciascuno: **Pagato** (contanti / carta) oppure **Annulla non pagato**
   (rilascia il buono nella stessa transazione dell'annullo).
2. **Promemoria automatico** (D): dalle 01:00, o alla chiusura del servizio se il tablet la registra, un banner
   "N ordini ancora da pagare" finché la lista non è vuota.
3. **Job alle 06:00**: **non** annulla e **non** rilascia nulla. Segna gli ordini come "anomalia di fine serata", che
   compaiono al primo accesso dello staff della serata successiva. **NEEDS_DECISION D-1**: in alternativa,
   annullamento automatico dopo N giorni (es. 3) con rilascio atomico.
4. Guardia: un ordine con buono RISERVATO non può essere modificato nel `total`/`discount_amount` da UPDATE diretto
   (trigger che rifiuta), così il tablet mostra sempre il totale corretto.

### 3.4 Verifiche richieste

| Punto | Esito / progetto |
|---|---|
| Totale scontato sul tablet | Oggi nessun badge (V). F5: "BUONO −5 €" + "DA INCASSARE xx,xx €" grande in `KitchenOrderCard` / `OrderPaymentActions` / Solo. |
| Importo inviato a SumUp | = `order.total` (V). Lo sconto entra in `total` alla creazione, prima di ogni tentativo; vietato riscrivere `total` dopo un tentativo (charge riuscito ma ordine non pagato: rischio già osservato nel codice). |
| Annulli e rimborsi | Annullo: rilascio transazionale. Rimborso: revoca timbro, buono secondo D-2. Rimborso solo totale (V); nessun rimborso parziale in V1. |
| Doppio uso | Indici unici + `UPDATE ... WHERE status` + lock nella stessa gerarchia del pagamento (pagamento → ordine → buono). Test di concorrenza (due ordini col stesso buono in parallelo). |
| Associazione ordine ↔ tessera | Promozione dell'utente anonimo al telefono **mantenendo lo stesso uid** (da verificare tecnicamente in F0). La tessera vede solo ordini con `customer_id` = uid membro. **Mai** `order_code` o nickname come prova. Timbri con `order_id` UNIQUE, scritti solo dal percorso di conferma pagamento. Cambio telefono/dispositivo: nessun ripristino automatico in V1 (D-6). |

---

## 4. Piano tecnico a fasi verificabili

Ogni fase: Gate 1 (approvazione) → lavoro su branch dedicato → test → diff review → Gate 2. Migration, deploy e
configurazione Auth/SMS sono sempre azioni separate di Eros.

| Fase | Contenuto | File principali | Verifica (gate tecnico) |
|---|---|---|---|
| **F0 Prerequisiti** (nessun codice app) | Lettura stato migration remote (v3, retention). Prova su Supabase **locale**: utente anonimo → telefono con stesso uid (OTP di test). Scelta fornitore SMS e costo. Decisioni D-1…D-8. Consulto fiscale sconto e testi privacy. | — | Report con esiti; decisioni firmate da Eros |
| **F1 Base dati** [P] | Catalogo food autorevole (`is_food`/`food_amount` per item, MENU secondo D-5). Colonna `source` (`customer_app` / `staff_counter`) scritta dalle RPC. Funzione SQL `service_night(ts)` 06:00 Europe/Rome. Tabelle `food_club_members`, `_campaigns` (una attiva: vincolo di esclusione), `_stamps` (order_id UNIQUE), `_vouchers`, `_voucher_events`, `_referrals`. RLS, REVOKE esplicito di EXECUTE ad anon. | `supabase/migrations/<ts>_food_club_v1.sql` + `.test.js` | Test sul testo SQL; E2E reali locali (RLS: cliente vede solo la sua tessera, staff non scrive) |
| **F2 Logica pagamento** [P] | RPC cliente v4 con buono (riserva atomica, total scontato, rifiuto con Promo Pass). Estensione di `kitchen_payment_confirm` e `record_counter` (UTILIZZATO + timbro + premio invito, stessa transazione). Rilascio in `cancel_with_payment_attempt` e `mark_payment_abandoned`. Revoca su refund. Trigger guardia su `total`. Job 06:00 di sola segnalazione. | migration `<ts>_food_club_rpc_v1.sql`; `api/kitchen-sumup-refund.js`, `api/_lib/onlineAbandonSweep.js` se servono; `vercel.json` solo se cron | Test Postgres locali: ogni riga della matrice §3.2, idempotenza (replay), concorrenza doppio uso, pagamento tardivo dopo PA |
| **F3 Identità e consensi** [P] | Iscrizione telefono (OTP) con promozione dell'anonimo; consenso servizio + marketing con data/ora; esclusione dei membri dalla retention 90 gg; testi privacy dopo revisione legale. | config Auth, migration consensi, `src/pages/KitchenPrivacy.jsx` | E2E locale: ordine prima e dopo l'iscrizione resta collegato; push ancora attive |
| **F4 Cliente** | `/kitchen/club` [P routing], pagine e componenti del prototipo v3, striscia nel menu, righe Club **dentro `.cx`**, card su status, regole pure con test. | `src/pages/FoodClub.jsx`, `src/components/kitchen/FoodClub*.jsx`, `src/lib/foodClubRules.js(+test)`, `src/hooks/useFoodClub.js`, `CustomerKitchenMenu.jsx`, `CustomerCheckout.jsx`, `useKitchenOrders.js`, `CustomerOrderStatus.jsx` | Unit, lint, build con override, E2E mock; visual review 390/430 (pagamento visibile senza scroll) |
| **F5 Staff** | Badge buono e "DA INCASSARE", pannello fine servizio, vista CLUB in sola lettura. | `KitchenOrderCard.jsx`, `OrderPaymentActions.jsx`, `KitchenSoloService.jsx`, `ClubView.jsx`, `useFoodClubStats.js` | E2E reali locali con sessione staff; prova su tablet |
| **F6 Notifiche** [P] | "+1 timbro", "buono sbloccato", "buono in scadenza" solo con consenso; sezione Messaggi in app. | `supabase/functions/…`, `useWebPushSubscription.js` | Test funzione; verifica su iPhone con app installata |
| **F7 Misurazione** | Viste aggregate (iscritti, timbri, buoni emessi/usati/scaduti, quota ordini autonomi). Indicatori **descrittivi** separati dall'**effetto causale** (§5). | migration viste, `ClubView` | Numeri confrontati con query manuali |
| **F8 Collaudo e lancio** | `walbox-qa-serata`, `walbox-hardening` (abuso inviti, buoni), pilot con flag di campagna spento/acceso. | — | Checklist serata; poi gate Eros: `db push`, deploy |

Ordine obbligato: F0 → F1 → F2 → F3; F4/F5 possono partire su dati finti dopo F1, ma vanno in produzione solo dopo F2+F3.

---

## 5. Vincoli prima del lancio (da verificare, non dati per buoni)

1. **Categoria food lato server**: oggi solo client (V). Bloccante per soglie e timbri.
2. **Fiscale**: come appare lo sconto sullo scontrino o nel corrispettivo, e se SumUp/registratore lo gestiscono. Consulto
   del commercialista.
3. **Privacy e consensi**: l'informativa oggi dice "nessuna profilazione" (`KitchenPrivacy.jsx`, V): va riscritta con
   revisione legale; servono due consensi separati e registrati.
4. **Accesso con telefono**: promozione anonimo → telefono con stesso uid, costo SMS, rate-limit e anti-abuso OTP.
5. **Permessi e dati**: tabelle Club solo SECURITY DEFINER, numero di telefono mai esposto allo staff per intero
   (mascherato), REVOKE ad anon.
6. **Misurazione del ritorno**: descrittivi (tasso di seconda visita degli iscritti) ≠ effetto del Club. Per l'effetto:
   confronto con il periodo prima del lancio sulla quota di ordini autonomi e di clienti di ritorno, oppure **gruppo di
   controllo** (es. 10 % dei nuovi utenti senza striscia per 30 giorni). **NEEDS_DECISION D-8**.

---

## 6. Rischi e decisioni ancora da approvare

### Decisioni (Eros / locale)
| ID | Decisione | Proposta |
|---|---|---|
| D-1 | PCP mai pagato a fine serata | Nessun rilascio automatico; pannello fine servizio + anomalia il giorno dopo. Annullo automatico dopo N giorni? |
| D-2 | Buono UTILIZZATO su ordine poi rimborsato | Riaccredito DISPONIBILE con scadenza originale |
| D-3 | L'ordine con buono genera timbro? Soglia prima o dopo lo sconto? | Sì, food prima dello sconto |
| D-4 | Timbro di benvenuto: finestra e stessa serata | 30 gg dall'iscrizione; il primo ordine completa la tessera |
| D-5 | MENU food+bevanda nella soglia | Conteggiati per intero come food (A6 Fase 2) o con quota food fissa per item |
| D-6 | Cliente che cambia telefono/dispositivo | Nessun ripristino in V1; ripristino manuale dello staff in V2 |
| D-7 | Serata del timbro: `created_at` o `paid_at` | `created_at` (quando il cliente era al locale) |
| D-8 | Metodo di misurazione | Confronto pre/post + gruppo di controllo piccolo |
| D-9 | Soglia 12 € e costo 5 € | Approvazione economica del locale |
| D-10 | Fornitore SMS e budget | Da scegliere in F0 |
| D-11 | Nome e testi definitivi, informativa | Validazione col locale e legale |
| D-12 | Campagna 2 (50 €): durata, finestra di accumulo, soglia d'uso del buono | Durata 30 gg, buono con le stesse regole (≥ 12 € food) |

### Rischi tecnici
| Rischio | Gravità | Mitigazione |
|---|---|---|
| Staff modifica `total` di un ordine con buono → SumUp o cassa incassano l'importo sbagliato | Alta | Trigger guardia (§3.3.4) |
| Ordini staff contati come cliente | Alta | Colonna `source` scritta dalla RPC, non dal client |
| Doppio uso del buono in concorrenza | Alta | Indici unici + UPDATE condizionato + test di concorrenza |
| Pagamento tardivo dopo PA/annullo con buono già rilasciato | Media | Segnalazione in riconciliazione; caso raro (V: oggi già gestito come manuale) |
| Retention privacy cancella utenti anonimi divenuti membri | Media | Escludere i membri prima del lancio (F3) |
| Abuso inviti (più telefoni) | Media | Telefono verificato, limite 5/30 gg, revisione in `walbox-hardening` |
| Migration v3/retention non applicate in produzione | Da verificare | Lettura `migration list` in F0 |
| Push su iPhone solo con app installata | Bassa | Sezione Messaggi in app |

---

## 7. Stima delle attività (dimensione, non tempi)

Nessun tempo stimato: non esistono misure storiche affidabili su attività simili in questo repo. La stima indica il
volume e la complessità relativa (S = poche righe/1 file, M = più file o una RPC, L = più RPC con test di concorrenza).

| Fase | Attività | Dimensione | Area protetta | Gate Eros |
|---|---|---|---|---|
| F0 | 4 verifiche (migration remote, OTP+uid, SMS, fiscale) + 11 decisioni | S per verifica | lettura remota | decisioni |
| F1 | 1 migration (6 tabelle, 1 funzione, 2 colonne, RLS) + test | L | sì | `db push` |
| F2 | 1 RPC nuova, 3–4 RPC estese, 1 trigger, 1 job, test matrice + concorrenza | L (la più delicata: soldi reali) | sì | `db push`, deploy |
| F3 | config Auth, 1 migration consensi/retention, privacy | M | sì | config SMS, legale |
| F4 | ~6 componenti nuovi, 5 file modificati, regole pure + test | L | routing | deploy |
| F5 | 3 file modificati, 1 vista nuova, 1 hook | M | no | deploy |
| F6 | 1 funzione push estesa, preferenze | M | sì | `functions deploy` |
| F7 | viste aggregate + 1 schermata | M | sì | `db push` |
| F8 | collaudo serata, hardening, pilot | M | — | lancio |

Modello/effort: F0, F2 e i passaggi sicurezza in sessione principale (Opus, proporre `/effort high` per F2); F1, F4, F5 a
subagent Sonnet medium con brief completo; QA a `walbox-qa-serata` e `visual-reviewer`.
