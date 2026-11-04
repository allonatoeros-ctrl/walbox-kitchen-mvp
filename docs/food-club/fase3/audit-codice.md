# Audit codice Walbox Kitchen per Walrus Food Club (sola lettura)

Riferimento: `origin/main` = `595f639` (31/10/2026). Tutte le righe `file:riga` sono di quel commit.
Percorsi abbreviati: `M/` = `supabase/migrations/`, `H/` = `src/hooks/useKitchenOrders.js`.
Legenda: **V** = VERIFICATO (letto nel codice), **D** = DEDOTTO (inferito, non provato nel codice letto).

Limite generale: il repo mostra cosa dicono le migration. Lo stato REMOTO (DB di produzione) non e' verificabile da qui.
`CHECKPOINT.md` dichiara applicate S2 (`20261009140000`), S3 (`20261012100000`), S6 cron (`20261012120000`) il 12/10.
Per `20261028121000` (v3 con orario di ritiro, intestata "LOCAL BUILD ONLY") e `20261030140000` (privacy retention,
"SOLO LOCALE") lo stato remoto e' ignoto: **D**, da controllare prima di fidarsi.

---------------------------------------------------------------------------------------------------

## 1. Stati dell'ordine e chi li cambia

### 1.1 Colonne e valori ammessi (V)
- `kitchen_orders.status` CHECK finale (8 valori): `pending_counter_payment`, `received`, `preparing`, `ready`,
  `delivered`, `cancelled`, `pending_online_payment` (POP), `payment_abandoned` (PA)
  -> `M/20261009140000_kitchen_orders_online_payment_lifecycle_v1.sql:40-46` (la baseline ne aveva 6: `M/20260710173936_kitchen_schema_baseline_v1.sql:75-78`).
- `kitchen_orders.payment_status` CHECK finale (NULL o): `pending_counter_payment`, `paid`, `cancelled`, `refunded`
  -> `M/20260828100200_kitchen_orders_payment_hub_alter_v1.sql:26-29`.
- `kitchen_orders.payment_method` CHECK finale: `counter`, `sumup_online`, `sumup_pos`, `satispay_app`, `cash`,
  `card_counter_manual`, `manual_comp`, `manual_other` -> `M/20260906171426_kitchen_pilot_order_contract_rpc_v1.sql:144-149`.
- `kitchen_payments` (registro pagamenti): `status` in `initiated|pending|succeeded|failed|cancelled`
  (`M/20260828100000_kitchen_payments_v1.sql:49-51`); `direction` `charge|refund` (:46-48); `channel` `app|counter` (:34-36);
  `method` come sopra piu' `card_counter_manual` (`M/20260906171426...:134-139`).
- Colonne extra utili: `online_payment_disabled` (`M/20260923120000...:27`), `client_request_id` uuid
  (`M/20261009140000...:53`), `pickup_slot` (`M/20261028121000...:39`), `fulfillment_type`, `service_day`/`service_sequence`
  (`M/20260905072954...:~20`), `discount_amount` e `promo_code` (`M/20260910120000_kitchen_promo_pass_redeem_v1.sql`, ADD COLUMN in testa al file).
- Nota: non esiste uno stato "pagato" nello `status`: il pagato e' `payment_status='paid'` + `paid_at`. Esiste uno stato
  `refunded` solo in `payment_status`, mai in `status`.

### 1.2 Chi cambia cosa (V)
| Chi | Cosa | Dove |
|---|---|---|
| RPC cliente `kitchen_customer_create_order` (v1, 5 arg) | crea sempre `pending_counter_payment` (PCP) | `M/20260923130000_kitchen_service_state_v1.sql:188-316` (status :291, payment_status :294) |
| RPC cliente `kitchen_customer_create_order_v2` | `counter` -> PCP, `online` -> POP con payment_status NULL | `M/20261012100000_kitchen_online_payment_lifecycle_rpc_v1.sql:148-155` |
| RPC cliente `..._v3` | wrapper di v2 + orario di ritiro | `M/20261028121000...:51-102` |
| RPC staff `kitchen_payment_record_counter` | PCP -> `received` + `paid` (cash / card_counter_manual) | `M/20260913120000_kitchen_payment_counter_online_exclusivity_v1.sql:72-84` |
| RPC service_role `kitchen_payment_confirm` (webhook/reconcile/sweep SumUp) | POP o PCP -> `received` + `paid` nello STESSO UPDATE; PA -> solo ledger + log; cancelled -> solo ledger + log; altri stati -> solo campi pagamento | `M/20261012100000...:325-371` |
| API + RPC `kitchen_order_switch_to_counter_system` (cliente, "Paga al banco") | POP -> PCP, `online_payment_disabled=true`, attempt vivi chiusi `failed/customer_switched_to_counter` | `api/kitchen-customer-switch-to-counter.js:148-176`; `M/20261012100000...:593-685` |
| RPC `kitchen_payment_attempt_close_unpaid` (staff, "PASSA AL BANCO") | non cambia status ordine: mette `online_payment_disabled=true` e chiude l'attempt `failed/staff_closed_for_counter` | `M/20260923121000_kitchen_payment_attempt_close_unpaid_online_disable_v1.sql:31-~95` |
| Sweep abbandono (pg_cron -> API -> RPC `kitchen_order_mark_payment_abandoned`) | POP > 5 min -> `payment_abandoned` (PA) | `api/_lib/onlineAbandonSweep.js:71-111`; `M/20261012100000...:696-782` |
| RPC staff `kitchen_order_cancel` / `kitchen_order_cancel_with_payment_attempt` | qualunque stato non pagato -> `cancelled` (rifiuta se `payment_status='paid'`) | `M/20260914090000_kitchen_order_cancel_guard_v1.sql:56-65`; `M/20260921100000_kitchen_payment_cancel_hardening_v1.sql:209-237` |
| API+RPC rimborso (staff) | `payment_status` -> `refunded` (status NON cambia) | `M/20260830120000_kitchen_payment_refund_lifecycle_v1.sql:163-165` |
| **UPDATE diretto della tabella da parte dello staff** (RLS) | `received -> preparing -> ready -> delivered` e "undo" | `H/src/hooks/useKitchenOrders.js:188-199` (`supabaseUpdateOrder`), :876-893 (`updateOrderStatus`), policy `M/20260710173936...:109-112` |

### 1.3 Transizioni
- **Guardate dal trigger DB** (solo per righe che PARTONO o ARRIVANO in POP/PA): `M/20261009140000...:93-150`.
  - qualsiasi riga con `payment_status='paid'` e status POP/PA viene rifiutata (:99-104);
  - POP/PA -> `received` solo se `paid` nello stesso statement (:117-123);
  - POP/PA -> PCP solo se `online_payment_disabled=true` (:124-130);
  - POP/PA -> `pending_online_payment|payment_abandoned|cancelled` ammesse (:131-132);
  - POP/PA -> `preparing|ready|delivered` MAI direttamente (:133-137).
- **Non guardate (V come assenza):** tutte le transizioni che non partono da POP/PA. Nel codice letto NON c'e' nessun trigger o
  check che impedisca a un PCP non pagato di andare `preparing -> ready -> delivered`, ne' di tornare indietro (undo).
  Il commento di `M/20261009140000...:88` lo dice: "i flussi legacy (PCP -> received -> preparing -> ready -> delivered, cancel) restano identici".
  La UI Solo mette "CONFERMA PAGAMENTO" prima (`src/pages/KitchenSoloService.jsx:100-101`), ma e' una convenzione di UI, non un vincolo DB.
- Terminali di fatto: `delivered`, `cancelled`, `payment_abandoned`. `payment_abandoned` puo' rientrare in POP per trigger (:86-87) ma
  `kitchen_payment_attempt_start` lo rifiuta (`M/20261012100000...:428-431`), quindi non succede dal flusso reale.
- Un ordine pagato non si annulla finche' non e' rimborsato (`order_already_paid_cannot_cancel`); dopo il rimborso (`refunded`) lo staff lo annulla.
  Rimborso e' sempre totale (importo copiato dall'addebito: `M/20260830120000...:96`).

### 1.4 Consegne per Food Club
- Lo stato ordine NON dice "pagato": la fonte del pagamento e' `kitchen_payments` (riga `direction='charge' AND status='succeeded'`),
  protetta dall'indice unico `kitchen_payments_one_succeeded_charge_per_order` (`M/20260828100000...:59-61`).
  Perche' `payment_status` e' modificabile con UPDATE diretto dallo staff (vedi sezione 10), per i timbri e per "UTILIZZATO" conviene
  agganciarsi al charge `succeeded` (o a un trigger su di esso), non a `payment_status`. (D: la vista `kitchen_payments_provider_drift_candidates`
  esiste proprio per scovare `paid` senza charge: `M/20261012100000...:793-807`.)

---------------------------------------------------------------------------------------------------

## 2. Ordine del cliente o dello staff: come si distingue

- **V: non esiste nessuna colonna `source`/`channel`/`created_by`** su `kitchen_orders` (elenco ADD COLUMN delle migration: online_payment_disabled,
  ready_event_id, ready_push_claimed_at, client_request_id, pickup_slot, discount_amount, promo_code, fulfillment_type, service_day, service_sequence).
- **V: lo staff crea gli ordini con la STESSA RPC del cliente.** `CounterAssistedOrder` chiama `addOrder` senza `paymentLane`
  (`src/pages/CounterAssistedOrder.jsx:274-290`) -> `createOrderOnServer` usa la v1 `kitchen_customer_create_order` (`H:658`).
  Dentro la RPC `customer_id = auth.uid()` (`M/20260923130000...:290`), cioe' per l'ordine al banco `customer_id` e' l'utente STAFF.
- **V: i marcatori dell'ordine assistito sono solo testo scritto dal client**: `nickname = 'BANCO'` e `customer_note` con
  "ORDINE ASSISTITO — SENZA APP" (`CounterAssistedOrder.jsx:34-40`, :265). Un cliente puo' scrivere gli stessi testi: NON affidabile.
- **V: la corsia cliente dell'app** (v2/v3, PCP o POP) passa sempre `client_request_id` dal client (`H:625`), ma una chiamata diretta
  puo' passare NULL (`M/20261012100000...:52` DEFAULT NULL); inoltre lo staff potrebbe chiamare v2 col proprio JWT. Non affidabile come prova.
- **Segnali affidabili lato server (D, da implementare):**
  1. `customer_id` NON appartiene a `kitchen_staff_members` (tabella: `M/20260710173936...:17-24`, funzione `is_staff_for_venue` :36-48)
     -> ordine di un utente non-staff. Robusto: non lo falsifica il cliente.
  2. `auth.users.is_anonymous` / claim `is_anonymous` del JWT: i clienti sono anonimi (`signInAnonymously`: `H:588`, `src/hooks/useOrderPaymentFlow.js:64`),
     lo staff fa login email (`src/lib/supabaseAuth.js:11-15`, `getStaffSession` scarta gli anonimi).
  3. Meglio: una colonna `source` scritta SOLO dalla RPC in base a `is_staff_for_venue()` (la RPC conosce l'identita' di chi chiama).
- Rischio residuo: uno staff che apre l'app cliente dallo stesso account crea un ordine "da staff" anche se e' per un cliente. Scenario basso ma reale.

---------------------------------------------------------------------------------------------------

## 3. Totale e importo SumUp

### 3.1 Dove si calcola il totale (V: SERVER)
- Il client invia solo `item_id` e `quantity` che contano: la RPC proietta `line(item_id text, quantity integer)` e IGNORA `name`/`price` del client
  (`M/20260923130000...:235-237`, :265-269; v2: `M/20261012100000...:142-146`). Nomi e prezzi delle righe vengono riscritti dal catalogo
  (`M/20260923130000...:305-309`; v2 :192-196). Commento di conferma: `src/lib/kitchenServiceRules.js:15-19`.
- Catalogo prezzi = tabella `kitchen_menu_items(venue_id,item_id,name,price)` (`M/20260912100000_kitchen_menu_items_v1.sql:14-22`), `price NULL` = non ordinabile;
  disponibilita' = `kitchen_menu_availability` (assenza riga = disponibile). Le tabelle sono in sola lettura per anon/cliente, scrivibili dallo staff (:32-34).
- Le policy INSERT dirette del cliente su ordini/righe sono state RIMOSSE: `DROP POLICY customer_insert_own_order_items / customer_insert_own_orders` (`M/20260906171426...:124-125`).
  Quindi il cliente puo' creare ordini SOLO tramite RPC (V come assenza di policy successive; D sul remoto).

### 3.2 Importo mandato a SumUp (V)
1. Il cliente chiama `kitchen_payment_attempt_start(order, 'app','sumup','sumup_online', amount, key)`. La RPC rifiuta se `p_amount <> v_order.total`
   (`M/20261012100000...:464-466`), verifica che l'ordine sia suo (:445-447) e blocca ordine `payment_abandoned` (:429), POP scaduto oltre 4:30 (:435), gia' pagato (:440).
2. `api/kitchen-sumup-create-checkout.js` rilegge `kitchen_orders.total` con service role (:58-62), verifica proprietario (:72),
   rilegge l'attempt (:76-80), e chiude la richiesta se `attempt.amount != order.total` (:115-120).
3. L'importo inviato a SumUp e' `attempt.amount` (:195), cioe' il valore copiato dal totale server. Valuta 'EUR' fissa. Il corpo del POST dal client non porta
   nessun importo (il client manda solo `order_id` e `payment_attempt_id`: :26).
4. Alla conferma (webhook/reconcile) l'importo si controlla due volte: `attempt.amount == checkout.amount` (`api/_lib/sumupPaymentResolution.js:51`) e
   `v_payment.amount == kitchen_orders.total` dentro `kitchen_payment_confirm` (`M/20261012100000...:309-323`); se diverge il charge resta `succeeded`
   ma l'ordine NON diventa `paid` e si scrive `payment_confirmed_amount_mismatch` con `needs_manual_reconciliation`.
- **Conclusione V: il cliente NON puo' manipolare l'importo SumUp.** Gli unici che possono cambiare `kitchen_orders.total` dopo la creazione sono:
  (a) la RPC sconto promo (vedi 3.3), (b) lo STAFF con UPDATE diretto (RLS permette UPDATE di qualsiasi colonna: `M/20260710173936...:109-112`;
  il file stesso lo segnala come "Fuori scope (gate separato): UPDATE staff su kitchen_orders.total", `M/20261009120000_kitchen_payment_amount_integrity_v1.sql:20`).

### 3.3 Sconti / promozioni / righe negative (V: ESISTE un precedente, il "Promo Pass")
- Tabella `kitchen_promo_passes` (codice `WALRUS-XXXXX`, `status issued|redeemed`, UNIQUE per cliente+campagna): `M/20260909140000_kitchen_promo_pass_issuance_v1.sql:11-25`.
- Riscatto: `kitchen_promo_pass_redeem_for_order` (versione finale `M/20261009120000_kitchen_payment_amount_integrity_v1.sql:22-132`):
  lock `FOR UPDATE` su ordine (:45) e pass (:83-86); sconto = 10% del Peso Massimo meno caro (allowlist hardcoded :100-111);
  `UPDATE kitchen_orders SET discount_amount, promo_code, total = total - sconto` (:113-118) -> il totale NETTO e' scritto in `total`.
  Consumo anti-doppio-uso atomico: `UPDATE ... WHERE status='issued'` e, se 0 righe, eccezione che annulla tutto (:123-128).
  Il pass e' bruciato al riscatto, non al pagamento.
- **Il pass NON viene rilasciato se l'ordine viene annullato/abbandonato/rimborsato**: nessuna delle RPC di cancel/abandon/refund/switch menziona promo
  (grep su `M/20260914*`, `M/20260921*`, `M/20261012100000*`: zero occorrenze). Esattamente il comportamento che il Food Club deve evitare con RISERVATO/RILASCIATO.
- Protezione importante per un voucher: lo sconto e' RIFIUTATO (`payment_in_progress`) se esiste gia' un attempt online vivo o `failed/sumup_failed`
  (:70-81), e bloccato se `payment_status='paid'` (:61-63). Quindi il totale e' "congelato" appena parte un checkout SumUp.
- Nel client il codice promo e' stato tolto dal carrello (CHECKPOINT "rimosso il codice promo dal carrello"), il badge in Solo resta in sola lettura
  (`src/pages/KitchenSoloService.jsx:963-971`); funzione "dormiente" (`M/20261028120000_kitchen_menu_items_menu_ottobre_v1.sql`, commento).
- Righe negative: **non esistono** (`kitchen_order_items.price >= 0` e `quantity > 0`: `M/20260710173936...:127-128`; `kitchen_payments.amount > 0`: `M/20260828100000...:52`).
  Il totale ordine ha CHECK `total >= 0` (baseline :86).
- Conseguenza per il buono 5 EUR: due modi coerenti con l'esistente: (A) scrivere lo sconto in `discount_amount` + abbassare `total` come il promo pass
  (compatibile con tutto il Payment Hub perche' `kitchen_payment_record_counter` e `attempt_start` leggono `total`), da fare PRIMA di qualsiasi attempt;
  (B) tenere `total` lordo e scalare altrove (NON consigliato: toccherebbe confronto importi SumUp). Attenzione: con (A) un ordine da 12,00 con buono 5 vale 7,00;
  la soglia "almeno 10 EUR di food per il timbro" va calcolata sul lordo food, non su `total`.

---------------------------------------------------------------------------------------------------

## 4. Food vs bevande: dove e' definito

- **V: il SERVER non conosce la categoria.** `kitchen_menu_items` ha solo `venue_id, item_id, name, price, updated_at` (`M/20260912100000...:14-22`);
  `kitchen_order_items` ha `item_id, name, quantity, price` (baseline :118-129). Nessuna colonna `category`.
- **V: la categoria vive solo nel client**, `src/data/kitchenMockData.js` (campo `category` per voce): `panini`, `birre` (righe 123-213), `bbq` (232-299),
  `tartare` (317-330), `cicchetti` (348-387), `insalatone` (401-427), `bevande` (440, 524-607), `tagliere` (460-491), `contorni` (630). Il client la usa
  per tab/UI (`src/lib/kitchenCart.js:118`, `kitchenServiceRules.js:46`). File PROTETTO (CLAUDE.md §5).
- **V: il catalogo server si aggiorna a mano con migration** (seed `M/20260912100000...:39-76`, poi sync v2, "menu ottobre" `M/20261028120000...`): quando si aggiunge una voce
  bisogna ricordarsi di aggiungerla in DUE posti (mock JS + migration), altrimenti `unknown_menu_item`.
- **Problema specifico "MENU" (combo cibo+bevanda a prezzo unico):** gli id `item-040/041/042` (con birra) e `item-060/061/062` (con bibita) sono UNA riga
  d'ordine con un solo prezzo (15,90 / 17,90 / 13,90 / 16,90) che include una bevanda; la bevanda scelta viaggia solo in `customer_note` come testo
  (`src/lib/kitchenServiceRules.js:13-31`, `buildIncludedBeersNote`). Quindi per questi item NON esiste una divisione food/bevanda calcolabile dal DB: serve una regola
  di prodotto (es. "il combo conta tutto come food" oppure una quota food fissa per item). **NEEDS_DECISION per Eros.**
- **Conseguenza V:** per calcolare "almeno 10 EUR di food" in modo autorevole serve una colonna/tabella lato server, per esempio
  `kitchen_menu_items.category` o `is_food boolean` (e un valore `food_amount` per i combo), popolata da migration e copiata nelle righe ordine
  al momento della creazione (`kitchen_order_items.category` / `food_total` snapshot sull'ordine) cosi' un cambio menu futuro non ricalcola il passato.
  Senza questo, la categoria arriverebbe dal client = falsificabile.

---------------------------------------------------------------------------------------------------

## 5. Abbandono e chiusura automatica

### 5.1 Ordine online (POP): gestito
- Cron DB `kitchen-online-abandon-sweep` ogni minuto (`M/20261012120000_kitchen_online_abandon_cron_v1.sql:146-150`): la funzione `..._tick` fa una sola SELECT leggera su POP piu' vecchi di 5 min
  e SOLO se ne trova chiama via `pg_net` l'API `/api/kitchen-online-abandon-sweep` con secret dedicato nel Vault (:100-130).
- L'API (`api/kitchen-online-abandon-sweep.js:16-47`, secret `KITCHEN_ABANDON_SWEEP_SECRET`) lancia `runOnlineAbandonSweep`: max 20 ordini, budget 25 s, per ciascuno:
  chiude i checkout SumUp vivi (`closeSumupAttempt`), se trova PAID conferma (POP -> received) e si ferma, altrimenti RPC `kitchen_order_mark_payment_abandoned` (POP -> PA)
  (`api/_lib/onlineAbandonSweep.js:17-21`, :71-111). Oltre 15 min o soldi da riconciliare -> log `online_abandon_stuck` deduplicato (:60-64; `M/20261012120000...:33-73`).
- Barriera anti-race: `checkout_claim_at` a 20 s (`M/20261012100000...:571-578`, :645-652); POP oltre created_at+4:30 non puo' piu' creare checkout (:435-438).
- Reconcile SumUp notturno su Vercel Cron `0 3 * * *` -> `/api/kitchen-sumup-reconcile-sweep` (vedi `vercel.json` chiave `crons`), secret `CRON_SECRET`; lavora
  gli attempt SumUp `initiated|pending` e `failed/sumup_failed`, max 200 (`api/_lib/sumupReconcileSweep.js:50-58`). Non tocca gli ordini PCP.

### 5.2 Ordine "paga al banco" (PCP) mai pagato: **NESSUNA chiusura automatica** (V come assenza)
- Nel codice letto non c'e' nessun job, cron, RPC o API che porti un PCP a `cancelled`/`payment_abandoned`: `grep pending_counter_payment` in `api/` e `supabase/functions/`
  trova solo l'idempotenza dello switch (`api/kitchen-customer-switch-to-counter.js:74`). Il cron Vercel e il cron DB non lo menzionano.
- Un PCP resta nella lista live dello staff anche dopo la serata: `OPEN_ORDER_STATUSES = STAFF_OPERATIONAL_STATUSES` include `pending_counter_payment`
  e la finestra live prende "serata corrente + ordini ANCORA APERTI anche se piu' vecchi" (`H:171-184`, `src/lib/kitchenServiceRules.js:481-486`).
  Per chiuderlo lo staff deve annullarlo a mano (RPC `kitchen_order_cancel`, :31-75).
- Il watchdog (solo osservazione, NON applicata/gestita da qui) classifica il PCP come `awaiting_counter` senza soglia (`M/20261023100000_watchdog_observability_v1.sql:662`);
  l'unico stato "rotto" per il lato online e' `broken_pop_not_closed` (:659-660).
- Retention privacy (se applicata) anonimizza nickname/note dopo 30 gg ma non cambia status (`M/20261030140000_kitchen_privacy_retention_v1.sql:49-56`).
- **Fine serata:** nulla di automatico alle 06:00. Il "giorno di servizio" lato server NON e' alle 06:00: vedi sezione 5.3.
- **Rischio Food Club (ALTO):** un buono RISERVATO su un ordine PCP mai pagato resterebbe riservato per sempre se non si aggiunge una scadenza/rilascio.
  Serve una regola esplicita (es. rilascio alla chiusura della serata alle 06:00 Europe/Rome, oppure alla cancellazione ordine, oppure TTL). Inoltre un PCP puo'
  anche andare `preparing/ready/delivered` senza essere pagato (vedi 1.3): la riserva va sciolta alla CANCELLAZIONE o al fine-serata, non a "delivered".

### 5.3 Attenzione: due definizioni di "giorno"
- **V:** `service_day` salvato dal server = `timezone('Europe/Rome', now())::date` cioe' data di calendario (mezzanotte): `M/20261012100000...:60`.
  Il client invece usa la serata 06:00->06:00 su `created_at` (`src/lib/kitchenServiceRules.js:57-69`, :125-135) e dichiara in commento che `service_day`
  "NON e' utilizzabile come filtro della serata" (:57-61).
- Per "2 timbri in 2 serate diverse" NON si puo' usare `service_day`: serve una nuova funzione SQL "giorno di servizio" = `(created_at/paid_at AT TIME ZONE 'Europe/Rome' - interval '6 hours')::date`.
  Decidere se la serata di un timbro e' quella di `created_at` dell'ordine o di `paid_at` (client usa `created_at`, `useKitchenPayments.js:9`).

---------------------------------------------------------------------------------------------------

## 6. Conferma pagamento: atomicita' e idempotenza (V)

| Percorso | Serializzazione | Idempotenza |
|---|---|---|
| Webhook SumUp `api/kitchen-sumup-webhook.js` | Non fidarsi del payload: ricerca per `provider_ref` salvato (:60-66), GET autorevole a SumUp con la NOSTRA chiave (:105), controllo `checkout.id` e `checkout_reference == attempt.id` (:120); log evento dedup `${checkoutId}:${status}` (:134-139) | `applySumupCheckoutResult` -> RPC `kitchen_payment_confirm` |
| `kitchen_payment_confirm` | `SELECT ... FOR UPDATE` sul pagamento (`M/20261012100000...:245`), poi `FOR UPDATE` sull'ordine (:301-302) -> ordine di lock pagamenti poi ordine, uguale a cancel/switch/abandon (:37-39) | se gia' `succeeded` ritorna invariato (:254-256); se un altro charge e' gia' `succeeded` per l'ordine l'indice unico fa `unique_violation` e si registra `payment_confirm_lost_race` (:276-296) |
| Tick di abbandono / switch / close | advisory lock per il log stuck (`M/20261012120000...:55`); RPC con `FOR UPDATE` su pagamenti e ordine | RPC idempotenti (`switch` ritorna se gia' fatto: :626-628; `abandon` ritorna se gia' PA: :724-726) |
| Staff conferma al banco (`kitchen_payment_record_counter`, cash o `card_counter_manual`) | `FOR UPDATE` sull'ordine (`M/20260913120000...:39`) | se esiste un charge `succeeded` lo ritorna (:44-50); blocca se c'e' un attempt online vivo (`online_payment_in_progress`, :59-69); indice unico come rete di sicurezza |
| Creazione ordine | `INSERT` con contatore ordini atomico (`ON CONFLICT DO UPDATE`: `M/20261012100000...:162-167`) | v2/v3: indice unico parziale `(customer_id, client_request_id)` (`M/20261009140000...:60-62`) + retry su `unique_violation` (:197-210). **La v1 (cassa assistita) NON ha idempotenza** (nessun `client_request_id`): un doppio click puo' creare due ordini. |

- `card_counter_manual` e' una CONFERMA MANUALE dello staff ("Confermi che la carta/POS e' stata incassata per EUR x?", `window.confirm`:
  `src/pages/KitchenSoloService.jsx:466`, `src/pages/CounterAssistedOrder.jsx:306`): l'app non puo' verificare il POS. Il contante idem. (V)
- Caso "ordine gia' avanzato": se il pagamento arriva con ordine in `received/preparing/ready/delivered`, la conferma aggiorna solo i campi pagamento
  (`M/20261012100000...:365-371`). Un voucher collegato a un ordine in questi stati va comunque sciolto/consumato dal pagamento.
- Pagamento arrivato dopo abbandono o annullo: il denaro resta nel registro come `succeeded` ma l'ordine NON diventa `paid` (`payment_confirmed_after_abandon`
  :330-345 e `payment_confirmed_after_cancel` :346-364, entrambi `needs_manual_reconciliation`). **Rischio Food Club:** soldi incassati ma ordine non pagato -> niente
  timbro, e un buono RISERVATO a quell'ordine potrebbe essere rilasciato mentre il cliente ha pagato. Serve una regola per questo caso (riconciliazione manuale + eventuale timbro assegnato a mano).

---------------------------------------------------------------------------------------------------

## 7. Annullamenti e rimborsi

- **Chi annulla:** solo lo STAFF. Il cliente non ha un'azione di annullo. Percorso reale: `cancelOrder` (`H:1034-~1100`) chiama `/api/kitchen-cancel-with-payment-check`
  (`api/kitchen-cancel-with-payment-check.js:89,236`) che, con JWT staff, verifica il checkout SumUp e chiama `kitchen_order_cancel_with_payment_attempt`
  (`M/20260921100000...:166-247`: chiude l'attempt vivo `cancelled`, ordine `cancelled`, `cancel_reason`, `cancelled_at`, log). La RPC semplice `kitchen_order_cancel` (:31-75) esiste ma la UI usa l'API.
  Codici d'errore rilevanti: `order_already_paid_cannot_cancel`, `payment_attempt_not_cancelable`.
- **Rimborso:** esiste (V). `src/hooks/useKitchenOrders.js:244-260` `refundOrder` -> `/api/kitchen-sumup-refund` -> RPC `kitchen_payment_refund` (crea riga refund
  `initiated` dell'importo dell'addebito, :91-99) -> chiamata reale SumUp se `sumup_online`, ramo "solo registro" per `cash` / `card_counter_manual`
  (nota in `H:206-210`) -> `kitchen_payment_refund_confirm` mette `payment_status='refunded'` (`M/20260830120000...:163-165`).
  Rimborso solo TOTALE (V1). Poi la UI sblocca ANNULLA solo dopo aver riletto il `payment_status` dal server (`H:222-239`).
- Dopo il rimborso `status` NON cambia da solo; resta per esempio `delivered` finche' lo staff non annulla.
- Cambio d'idea del cliente online: "Paga al banco" (switch) e "Riprova"; non annulla ma sposta (sezione 1).
- **Rischi Food Club:**
  - il rimborso non rilascia nulla: se un timbro e' stato generato da un ordine poi rimborsato serve un trigger/regola per revocare il timbro, e se il buono
    era UTILIZZATO su quell'ordine decidere se si riaccredita (decisione di prodotto, NEEDS_DECISION);
  - l'annullo di un ordine con buono RISERVATO e' l'evento principale di RILASCIATO: va agganciato a `status -> cancelled` e a `payment_abandoned`, e va fatto
    in modo transazionale con la RPC di cancel, non dal client (lo staff puo' anche cancellare con UPDATE diretto, vedi 10).

---------------------------------------------------------------------------------------------------

## 8. Identita' cliente

- **V: il cliente e' anonimo** (Supabase Anonymous Auth). `supabase.auth.signInAnonymously()` quando manca una sessione:
  `H:586-591`, `src/hooks/useOrderPaymentFlow.js:64`, `src/hooks/usePromoPassIssue.js:26`, `src/hooks/useWebPushSubscription.js:78`.
  Gli utenti anonimi hanno ruolo DB `authenticated` (commento in `M/20261009130000_kitchen_payment_rpc_execute_grants_v1.sql:13` "anonymous sign-in = authenticated").
- **V: `kitchen_orders.customer_id uuid` -> `auth.users(id) ON DELETE SET NULL`** (baseline :60), valorizzato da `auth.uid()` (`M/20261012100000...:179`).
- **V: niente "codice pubblico" come chiave di accesso.** Esiste `order_code` (es. `A07`), generato da `kitchen_format_operational_code` per `service_day` (`M/20260905072954...:57-83`):
  e' un codice operativo di banco, ripartente ogni giorno e UNICO solo per `(venue_id, service_day)` (indice :`kitchen_orders_venue_service_code_unique`). NON e' segreto.
  La lettura dell'ordine e' ristretta da RLS a `customer_id = auth.uid()` (policy `customer_select_own_orders`, baseline :101-103) o staff. L'URL `/kitchen/status?orderId=<id>`
  richiede comunque sessione proprietaria; in piu' il client accetta solo ordini "ricordati" in localStorage (`rememberOwnedOrderId`, `H:39`; `CustomerKitchenMenu.jsx:622`;
  `CustomerOrderStatus.jsx:20-46`). Cambiando browser/dispositivo l'ordine non si ritrova (D: la sessione anonima vive in localStorage del browser).
- **V: ritenzione privacy (se applicata):** utenti anonimi inattivi 90 gg vengono CANCELLATI da `auth.users` (max 1000/notte) a meno che abbiano ordini recenti, pass promo, o siano staff;
  gli ordini restano con `customer_id NULL`: `M/20261030140000_kitchen_privacy_retention_v1.sql:100-116`. Una nuova tabella tessere/timbri NON e' nell'elenco `NOT EXISTS`:
  **va aggiunta**, altrimenti un cliente con 1 timbro e nessun ordine negli ultimi 90 gg perde l'identita' e (con FK `ON DELETE CASCADE`) la tessera, o (con `SET NULL`) la orfana.
  Inoltre il nickname degli ordini > 30 gg viene sostituito con 'anonimo' (:49-56): non usarlo come chiave.
- **Come associare in modo sicuro un ordine a una tessera dopo l'iscrizione (D, proposta):**
  1. L'iscrizione "promuove" l'utente anonimo corrente invece di creare un account nuovo (Supabase: `updateUser`/`linkIdentity` su sessione anonima mantiene lo STESSO `auth.uid()`),
     cosi' tutti gli ordini passati (`customer_id`), le push (`customer_id`) e il promo pass restano collegati senza copiare nulla. (D: non verificato nel repo, e' comportamento documentato di Supabase.)
  2. Tabella `food_club_members(user_id PK -> auth.users)` e timbri legati a `order_id` UNIQUE (un solo timbro per ordine) scritti SOLO da funzioni `SECURITY DEFINER`
     chiamate dal percorso di conferma pagamento (non dal client).
  3. Per ordini fatti PRIMA dell'iscrizione: assegnare il timbro retroattivo solo se `orders.customer_id = auth.uid()` e il charge e' `succeeded` (nessun codice da digitare, nessun ordine di altri).
  4. Se il cliente cambia dispositivo: login con email (account non anonimo) ricollega la tessera; gli ordini del vecchio uid anonimo NON si ricollegano da soli
     (serve un flusso di "merge" esplicito e rate-limited, da NON fare via order_code/nickname).
  5. Evitare qualsiasi flusso "inserisci il codice ordine A07" per reclamare un timbro: il codice non e' segreto e non e' unico nel tempo.

---------------------------------------------------------------------------------------------------

## 9. Vista staff e tablet (dove compaiono totale e "da incassare")

- **Solo Service** `src/pages/KitchenSoloService.jsx`: etichetta `DA INCASSARE` per PCP (:90), azione "CONFERMA PAGAMENTO — Incassa al banco e manda in cucina" (:100-101),
  gruppo coda `pagare` (:744), `PASSA AL BANCO` per sbloccare l'online (:373, :950), conferma carta/POS (:466), pagamento rapido da card laterale (:521-530),
  badge promo con `TOTALE EUR` (:965-969). E' l'UNICA UI staff operativa (CHECKPOINT "STABLE").
- **Cassa assistita** `src/pages/CounterAssistedOrder.jsx`: totale carrello (:596), pannello `DA INCASSARE` (:622), pagamento (:302-322), crea ordine (:268-298).
- **Azioni di pagamento cliente/staff** `src/components/kitchen/OrderPaymentActions.jsx` (bottone `PAGA AL BANCO` :140, `PASSA AL BANCO` flusso staff).
- **Pagamenti/Cassa** `src/pages/PaymentsView.jsx` (:107, :595), `src/components/kitchen/CassaControlSection.jsx` (Incasso totale / rimborsato / netto / insoluti: :70-104),
  hook `src/hooks/useKitchenPayments.js` (INCASSO = solo `kitchen_payments`; SERATA = `created_at` ordine 06:00->06:00: :9).
- **Storico** `src/pages/StoricoView.jsx`, `src/hooks/useKitchenOrderHistory.js`; **TV** `src/pages/KitchenTvScreen.jsx`; **Prep board** `src/pages/KitchenPrepBoard.jsx`; card ordine `src/components/kitchen/KitchenOrderCard.jsx`.
- **Cliente:** `src/pages/CustomerKitchenMenu.jsx` (checkout V2, `:580-593` invia `paymentLane`), `CustomerOrderStatus.jsx`, `CustomerOrderPayment.jsx`,
  `src/hooks/useOrderPaymentFlow.js` (avvio checkout SumUp).
- **Per il Food Club:** dove mostrare "buono 5 EUR applicato" e il nuovo totale: badge sullo stesso schema del promo (`kss-promo-badge`, :965-969) e riga in `CounterAssistedOrder`
  se mai la cassa assistita dovesse accettare buoni (oggi NON puo': ordine staff = nessun timbro, nessun buono, per la regola di prodotto).
- File PROTETTI da CLAUDE.md §5 che il Food Club toccherebbe: `supabase/migrations/`, `api/`, `src/data/kitchenMockData.js`, `vercel.json`, `src/App.jsx` (routing) -> task dedicato con Gate 1.

---------------------------------------------------------------------------------------------------

## 10. RLS e grant (sintesi)

Fonte: baseline (fotografia del remoto al 28/08, `M/20260710173936...`) + migration successive. **D sul remoto attuale**: lo schema reale non e' stato riletto.

| Tabella | Cliente (anon-sign-in = `authenticated`) | Staff (`is_staff_for_venue`) | anon puro |
|---|---|---|---|
| `kitchen_orders` | SELECT solo righe proprie (`customer_id = auth.uid()`); INSERT diretto RIMOSSO (`M/20260906171426...:125`); nessun UPDATE/DELETE | SELECT, **UPDATE di qualsiasi colonna** (baseline :105-112); nessun INSERT/DELETE | nessuna policy -> nulla |
| `kitchen_order_items` | SELECT delle proprie righe; INSERT diretto RIMOSSO (:124); nessun UPDATE/DELETE | SELECT; nessun INSERT/UPDATE/DELETE (baseline :136) | nulla |
| `kitchen_payments` | SELECT dei propri pagamenti (`M/20260828100000...:70-78`); nessuna scrittura | SELECT (:80-82); scritture solo via RPC | nulla |
| `kitchen_action_log` | nulla | INSERT e SELECT (baseline :197-203) | nulla |
| `kitchen_menu_items`, `kitchen_menu_availability`, `kitchen_service_state` | SELECT (anche anon puro) | scrittura (INSERT/UPDATE/ALL) | SELECT del solo `walrus-main` |
| `kitchen_promo_passes` | SELECT propri; scritture via RPC | SELECT | nulla |
| `kitchen_push_subscriptions` | SELECT/DELETE propri; INSERT solo via RPC `claim` | - | nulla |

- **V: lo STAFF puo' fare UPDATE diretto su `kitchen_orders` per qualsiasi campo** (`total`, `payment_status`, `status`, `payment_method`): la policy non limita le colonne e la RPC di conferma non e' obbligatoria per questo percorso.
  Il trigger lifecycle guarda solo POP/PA (sezione 1). Quindi il DB NON impedisce a uno staff di marcare `paid` senza pagamento o di cancellare un ordine pagato con UPDATE diretto
  (la UI usa le RPC/API, ma questo e' un fatto di policy). Per questo "UTILIZZATO" del buono deve dipendere dal charge `succeeded` in `kitchen_payments`, e la tabella buoni deve essere
  scrivibile SOLO da funzioni SECURITY DEFINER con `search_path` fissato, senza UPDATE staff diretto.
- **V: EXECUTE sulle funzioni:** i default privileges dello schema `public` danno EXECUTE ad `anon`; `REVOKE ... FROM PUBLIC` non lo toglie
  (`M/20261009130000...:3-8`, CHECKPOINT OPEN ISSUES). Le RPC nuove vanno create con `REVOKE ALL FROM PUBLIC; REVOKE EXECUTE FROM anon; GRANT EXECUTE TO authenticated|service_role`
  come fanno v2/v3 (`M/20261012100000...:216-218`, `M/20261028121000...:104-106`). La v1 `kitchen_customer_create_order` ha solo `REVOKE ALL FROM PUBLIC` (`M/20260923130000...:315-316`)
  quindi (D) probabilmente `anon` mantiene EXECUTE su di essa, ma e' innocua perche' `auth.uid() IS NULL -> customer_session_required` (:206-208).
- **D:** i GRANT di tabella non sono nelle migration (valgono i default Supabase `ALL` ad anon/authenticated, filtrati da RLS). Una tabella nuova senza policy esplicite = chiusa
  per RLS solo se si ricorda `ENABLE ROW LEVEL SECURITY`.
- Viste di pagamento ora `security_invoker` (`M/20261025120000_kitchen_payment_views_security_invoker_v1.sql`).

---------------------------------------------------------------------------------------------------

## 11. Notifiche push

- Tabella `kitchen_push_subscriptions(customer_id uuid NOT NULL -> auth.users ON DELETE CASCADE, endpoint UNIQUE, p256dh, auth_key, ...)`: `M/20260924120000_kitchen_push_subscriptions_v1.sql:22-38`.
  Quindi la push e' legata all'UTENTE (anonimo) che ha dato il permesso, non all'ordine.
- Iscrizione: solo via RPC `kitchen_push_subscription_claim` con `auth.uid()` (:74-125), rubata a un altro utente se lo stesso endpoint cambia proprietario.
- Invio: trigger `AFTER UPDATE` su `kitchen_orders` quando `status` diventa `ready` -> `net.http_post` all'Edge Function `send-order-ready-push` con `order_id` e `ready_event_id`
  (`M/20260924130000_kitchen_orders_ready_push_identity_v1.sql:82-137`). L'Edge Function rilegge l'ordine, prende `customer_id` e cerca le subscription di quel cliente
  (`supabase/functions/send-order-ready-push/index.ts:82-83, :121-123`); testo fisso "Il tuo ordine e' pronto! Passa al banco per ritirarlo." (:149-150).
- Per il Food Club: la push e' associata al `customer_id` quindi **resta valida se l'utente anonimo viene promosso** (stesso uid); NON esiste una push "buono in scadenza".
  Se si vuole, serve un nuovo invio (Edge Function o cron) che riusi la stessa tabella; anche qui `retention` cancella le iscrizioni non viste da 180 gg (`M/20261030140000...:91-93`).

---------------------------------------------------------------------------------------------------

## RISCHI PER IL FOOD CLUB (in ordine di gravita')

1. **Doppio uso del buono / race condition.** Oggi l'unico precedente (promo pass) usa un `UPDATE ... WHERE status='issued'` atomico con lock `FOR UPDATE` su ordine e pass
   (`M/20261009120000...:83-86, 123-128`). Il buono 5 EUR deve fare lo stesso: transizione DISPONIBILE -> RISERVATO con `UPDATE ... WHERE status='available' RETURNING`,
   indice unico parziale "un buono riservato per ordine" e "un ordine con un solo buono", FK all'ordine. Lock sempre nell'ordine gia' usato: pagamenti -> ordine -> buono, per evitare deadlock
   (`M/20261012100000...:37-39`). L'UTILIZZATO deve avvenire DENTRO `kitchen_payment_confirm` / `kitchen_payment_record_counter` (stessa transazione del `paid`), non in un secondo passo.
2. **Importo SumUp (basso se si segue il pattern).** Il cliente non puo' cambiare l'importo; il totale e' server (sez. 3.2). Il buono deve ridurre `kitchen_orders.total` PRIMA della creazione dell'attempt
   (il promo e' bloccato dopo: `payment_in_progress`), e il buono va riservato nella stessa RPC di creazione ordine (v4) oppure in una RPC dedicata che rifiuti se esiste un attempt vivo.
   Rischio nascosto: `kitchen_payment_confirm` confronta `charge.amount` con `kitchen_orders.total`; se qualcuno cambia `total` DOPO l'attempt (staff con UPDATE diretto, o un rilascio del buono che rialza il totale)
   il charge resta `succeeded` ma l'ordine non diventa `paid` (`M/20261012100000...:309-323`). Quindi il rilascio del buono NON deve mai riscrivere `total` su un ordine che ha un charge/attempt.
   Un ordine con buono che scende sotto 0,5 o a 0: `kitchen_payments.amount > 0` (CHECK), `total >= 0`; con soglia 12 EUR il minimo e' 7 EUR, ok.
3. **Ordine PCP aperto per sempre (nessun TTL).** Un buono RISERVATO su un PCP mai pagato resta bloccato (sez. 5.2). Serve: rilascio a `cancelled` (nella RPC di cancel, transazionale), a `payment_abandoned`, a `switch` se cambia
   lo scenario, e una regola di fine serata alle 06:00 Europe/Rome (cron DB come `kitchen-online-abandon-sweep`, ma per PCP) oppure un TTL piu' corto. Il PCP puo' anche procedere a `delivered` senza essere pagato:
   non usare `delivered` come segnale di uso. Prima di partire: decisione di prodotto su cosa succede al buono se il cliente ritira e "paga dopo" (NEEDS_DECISION).
4. **Associazione ordine -> tessera.** Cliente anonimo = uid nel browser; cancellato dopo 90 gg di inattivita' (se la privacy retention e' applicata) e perso se si cambia telefono/svuota i dati.
   Ordini staff hanno `customer_id` = uid staff -> non devono MAI generare timbri (nessuna colonna `source` oggi: filtrare con `customer_id NOT IN kitchen_staff_members` e meglio con una colonna `source` scritta dalla RPC).
   Non usare `order_code` o `nickname` come prova (non segreti, non unici nel tempo, anonimizzati a 30 gg). Estendere la retention privacy per escludere i membri Food Club.
5. **Categoria food/bevande non autorevole.** Oggi vive nel client (`kitchenMockData.js`), file protetto; il server ha solo `item_id/name/price`. Aggiungere `category`/`is_food` al catalogo DB e fare snapshot sulla riga ordine.
   I MENU (item-040/041/042/060/061/062) mischiano food e bevanda in una riga: regola di prodotto necessaria (NEEDS_DECISION).
6. **Due definizioni di giorno.** `service_day` server = mezzanotte; la serata e' 06:00->06:00 solo nel client. Per "2 serate diverse" serve una funzione SQL dedicata e un unico riferimento temporale (`created_at` dell'ordine come fa il client, o `paid_at`).
   Esempio limite: ordine creato 23:50, pagato 00:10 -> stessa serata; creato 05:55 pagato 06:05 -> a cavallo.
7. **Pagamento tardivo dopo abbandono/annullo.** `payment_confirmed_after_abandon/cancel` lascia l'ordine non pagato con soldi incassati (sez. 6): nessun timbro e potenziale rilascio del buono mentre il cliente ha pagato.
   Il Food Club deve agganciarsi a questi due log (`needs_manual_reconciliation`) o ignorare il buono in quel caso con revisione manuale.
8. **Rimborso e timbri.** Rimborso totale lascia `status` invariato e cambia solo `payment_status='refunded'`: revocare il timbro / non riaccreditare il buono sono decisioni da prendere (NEEDS_DECISION) e vanno agganciate a `kitchen_payment_refund_confirm`.
9. **Staff con UPDATE diretto.** Un account staff puo' alterare `total`/`payment_status`/`status` senza RPC. Per il Food Club: tabelle buoni/timbri con RLS senza policy di scrittura per staff, sola lettura, scrittura via SECURITY DEFINER; trigger di integrita' sullo stato del buono (non tornare a DISPONIBILE da UTILIZZATO, nessuna cancellazione).
10. **Funzioni e grant dimenticati.** Ogni nuova RPC avra' EXECUTE ad `anon` di default: `REVOKE` esplicito ad `anon`/`PUBLIC` e `GRANT` mirato; nuove tabelle con `ENABLE ROW LEVEL SECURITY`.
11. **v1 senza idempotenza e doppia versione RPC.** Esistono v1/v2/v3 in produzione (v3 stato remoto ignoto). Il buono va applicato solo nel percorso cliente app (v2/v3 -> nuova v4), mai nella v1 usata dalla cassa assistita.
12. **Stato remoto non verificato.** Prima di scrivere la macchina a stati: controllare in sola lettura (MCP Supabase, lettura) le migration realmente applicate (`list_migrations`), i CHECK reali di `kitchen_orders`, le policy e i grant, e che `20261028121000` e `20261030140000` siano o no a remoto.

## Decisioni di prodotto emerse (NEEDS_DECISION per Eros)
1. Come contano i MENU (combo cibo+bibita a prezzo unico) per la soglia 10 EUR food e per i 12 EUR del buono.
2. Il buono 5 EUR scala dal totale come sconto (`discount_amount`) o con altro schema? (compatibile col promo pass: si consiglia come sconto sul totale prima del checkout).
3. Buono UTILIZZATO su un ordine poi rimborsato: si perde, si riaccredita, o decide lo staff.
4. Timbro assegnato su ordine rimborsato/annullato dopo il pagamento: si toglie?
5. Riserva di un buono su ordine "paga al banco" mai pagato: rilascio a fine serata (06:00) o TTL (quanti minuti)?
6. Serata di riferimento del timbro: data di `created_at` o di `paid_at` dell'ordine?
7. Cosa fa il cliente che cambia telefono: login con email o nessun ripristino?
8. Ordini creati dallo staff (cassa assistita) per un cliente con tessera: restano senza timbro (come da regola)?
