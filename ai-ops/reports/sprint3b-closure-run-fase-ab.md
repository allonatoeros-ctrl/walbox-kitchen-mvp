# Sprint 3B Closure RUN — Fase A (code alignment) + Fase B (automated certification)

Data: 2026-09-06 · Branch `integration/fantawalrus-kitchen-v1` · Base: `ai-ops/reports/sprint3b-closure-plan.md`
Gate 1: concesso da Eros nel prompt della run (rimozione legacy tavoli/asporto + `/kitchen/entry` → redirect a `/kitchen`).
Nessun commit, push, deploy, mutazione DB/RPC/migration. Nessuno script aggiunto a `package.json`.

---

## 1. CHANGES

### 1.1 File eliminato
- **`src/lib/kitchenOrderContext.js`** (untracked, mai committato) — eliminato per intero.
  Conteneva `FULFILLMENT_TYPES`, `normalizeTableId()`, `readKitchenContext()` (parsing `?table=` / `?mode=asporto`)
  e `fulfillmentLabel()` ("AL TAVOLO"/"ASPORTO"). Tutto il file era `LEGACY_TO_REMOVE` per la decisione
  no-tables del 2026-09-05.

### 1.2 `src/hooks/useCustomerSession.js`
Rimossi `import { FULFILLMENT_TYPES }`, il campo `fulfillmentType` in `readSession()` e il parametro
`fulfillmentType = FULFILLMENT_TYPES.TABLE` in `saveSession()`.
**Esito notevole**: il file torna *byte-identico a HEAD* (`git diff` vuoto) — conferma che l'unica modifica
non committata su questo file era proprio il blocco legacy. Il campo `table` resta (consumato da
`CustomerKitchenMenu.jsx` e dal matching in `CustomerOrderStatus.jsx`): fuori dallo scope approvato di questa run.

### 1.3 `src/pages/CustomerKitchenEntry.jsx` — riscritto (-240 righe nette vs HEAD)
Decisione approvata da Eros: niente più form/tavolo su `/kitchen/entry`, compatibilità via redirect.
Il file è ora un componente di sola compatibilità:

```jsx
useEffect(() => {
  window.history.replaceState({}, "/kitchen" ...);
  window.dispatchEvent(new PopStateEvent("popstate"));
}, []);
return null;
```

Rimossi: `readKitchenContext()`, la scrittura di `fulfillmentType` in `walboxCustomerSession`, il form
"Numero tavolo *" con validazione bloccante, il titolo "Ingresso legacy Kitchen", il CTA condizionale
"Hai già un ordine?". `replaceState` (non `pushState`) evita che il Back del browser rimbalzi sulla route morta.
`src/App.jsx` **non toccato**: la `case "/kitchen/entry"` resta e continua a montare il componente (area protetta,
nessuna modifica al routing).

### 1.4 `src/pages/CounterOrdersView.jsx`
Rimossi l'import di `fulfillmentLabel` e i 2 `<span className="ksd-row-table">{fulfillmentLabel(order)}</span>`
(coda "IN ATTESA PAGAMENTO" e coda "PRONTI"). Il codice ordine `#{order.orderCode}` accanto era già presente
e resta l'identificatore visibile. Lo split pagamento CONTANTI/CARTA-POS non è stato toccato.

### 1.5 `src/pages/CustomerOrderStatus.jsx`
Rimosso l'import; la cella "RITIRO" della griglia DATI ORDINE mostra ora la costante **`AL BANCO`**
al posto di `fulfillmentLabel(order)`.
*Scelta motivata*: la cella non è stata eliminata perché `.ost-info-cell:nth-child(odd)` / `--bottom` disegnano
i bordi della griglia 2×2 (RITIRO / NICKNAME / ORA ORDINE / CODICE ORDINE); rimuovere una cella avrebbe rotto
il layout. "AL BANCO" è l'unica modalità di ritiro esistente ora che i tavoli non esistono.

### 1.6 `src/pages/KitchenSoloService.jsx`
Rimossi l'import e i 2 usi di `fulfillmentLabel()`:
- card di coda: `{orderCode} · {label} · {min} min` → `{orderCode} · {min} min` (rimosso anche il separatore
  `kss-qcard-dot` orfano);
- riga focus: `{orderCode} · {label} · {min} MIN` → `{orderCode} · {min} MIN` (rimosso il `kss-focus-sep` orfano,
  mantenuto `kss-focus-sep--min`).
Audio, realtime, KPI, undo, `confirmPayment(id,'cash')` **non toccati**.

### 1.7 Non toccato (come da vincoli della run)
RPC/Supabase/DB, tutte le migration, promo, comportamento cash/card, `useKitchenAudio.js`, realtime,
`useKitchenOrders.js`, `CustomerKitchenMenu.jsx`, `PaymentsView.jsx`, `src/App.jsx`, `package.json`.

---

## 2. TEST_RESULTS

| Verifica | Comando | Esito |
|---|---|---|
| Build | `npm run build` | **PASS** (exit 0, `✓ built in 339ms`; solo warning pre-esistenti di chunk size / dynamic import) |
| Lint file target | `npx eslint <5 file target>` | **8 errori, tutti pre-esistenti** — vedi §2.1 |
| Unit migration | `node supabase/migrations/20260901120000_kitchen_pilot_order_contract_v1.test.js` | **PASS 5/5** |
| Unit realtime | `node tests/unit/sprint3b-kitchen-realtime.test.mjs` | **PASS 2/2** |
| E2E customer | `npx playwright test tests/e2e/customer-kitchen-flow.spec.js` | **23/26 PASS, 3 FAIL pre-esistenti** — §4 |
| E2E kitchen solo | `npx playwright test tests/e2e/kitchen-solo-service.spec.js` | **15/17 PASS, 2 FAIL pre-esistenti** — §4 |
| Redirect `/kitchen/entry` (ad-hoc) | spec Playwright in scratchpad | **PASS 2/2** — §2.2 |

**Nota infrastrutturale**: la porta 5174 era già occupata da un dev server esterno a questa sessione
(PID 10601). Non è stato ucciso. Le run E2E sono state eseguite su un web server isolato in porta 5199,
via una config Playwright temporanea **in scratchpad** (`pw.config.mjs`, con `node_modules` simlinkato):
stesso `testDir`, stessi test, stesso `VITE_E2E_BYPASS_STAFF_AUTH=true`. Nessun file di config del repo modificato.

### 2.1 Lint — prova che i 3 errori non sono nuovi
Baseline misurata linting le versioni **HEAD** degli stessi 5 file (copiate in una dir temporanea dentro il repo,
lintate con la stessa `eslint.config.js` — che applica le regole uniformemente a `**/*.{js,jsx}` senza scoping
per path — e poi cancellata):

- **Baseline HEAD: 10 errori** — `CustomerKitchenEntry.jsx` 4 (2× `set-state-in-effect`, 2× `no-empty`),
  `CustomerOrderStatus.jsx` 2 (`no-unused-vars` su `tick`, `set-state-in-effect`),
  `KitchenSoloService.jsx` 2 (`set-state-in-effect`, `purity`), `useCustomerSession.js` 2 (`no-empty`).
- **Dopo la run: 8 errori** — esattamente lo stesso insieme **meno** i 4 di `CustomerKitchenEntry.jsx`
  (il file riscritto è lint-clean).

Nessuna nuova classe di errore introdotta; il delta è solo in negativo (−2 netti). Gli 8 residui sono
regole React 19 (`react-hooks/set-state-in-effect`, `react-hooks/purity`) e `no-empty` su `catch { }`,
tutte su righe fuori dallo scope di questa run.

### 2.2 Verifica ad-hoc del redirect (non nel repo)
Due test scritti in scratchpad (**non aggiunti a `tests/e2e/`**, nessuno script wired):
1. `/kitchen/entry` → URL finale `/kitchen`, nessun testo "Numero tavolo", nessun "Ingresso legacy Kitchen" — PASS.
2. `/kitchen/entry?table=7&mode=asporto` → URL finale `/kitchen`, nessun `fulfillmentType` scritto in
   `walboxCustomerSession` — PASS.

Servono come evidenza della run; promuoverli a test permanenti richiede un Gate 1 dedicato (vedi §6).

---

## 3. LEGACY_SEARCH

Grep su `src/`, `tests/`, `supabase/` per `fulfillment*`, `asporto`/`takeaway`, `readKitchenContext`,
`FULFILLMENT_TYPES`, `normalizeTableId`, `table`.

### 3.1 Zero riferimenti applicativi residui — CONFERMATO
`FULFILLMENT_TYPES`, `readKitchenContext`, `fulfillmentLabel`, `fulfillmentType`, `normalizeTableId`,
`kitchenOrderContext`, `mode=asporto`: **nessuna occorrenza di codice eseguibile** nel flusso Kitchen.
Le uniche occorrenze rimaste sono, per costruzione, *asserzioni di contratto e commenti storici*:

| Occorrenza | Classificazione |
|---|---|
| `tests/e2e/customer-kitchen-flow.spec.js:112` — `expect(latest.fulfillmentType).toBeUndefined()` | **DA MANTENERE**: è l'asserzione che *garantisce* il contratto no-tables. Verde. |
| `tests/e2e/customer-kitchen-flow.spec.js:97,100` — commenti "no-tables contract" | Documentazione. |
| `src/hooks/useKitchenOrders.js:269` — commento "No table/fulfillment concept" | Documentazione. |
| `src/pages/CustomerKitchenEntry.jsx:7` — commento sul perché la route è un redirect | Documentazione (scritto in questa run). |
| `supabase/migrations/20260901120000_*.sql:8,9,85`, `20260906120000_*.sql:28` | **Schema/migration storiche**: commenti che dichiarano l'assenza di `fulfillment_type`/`table_id` in input. Nessun DDL di fulfillment. |
| `supabase/migrations/20260901120000_*.test.js:16-19,35` | Test che *asserisce l'assenza* di `p_fulfillment_type`/`p_table_id`. Verde 5/5. |

### 3.2 `table` — residui classificati (fuori dallo scope approvato di questa run)

**A. Supabase API, non "tavolo"** — falsi positivi, nessuna azione:
`useKitchenOrders.js:82` (`table: 'kitchen_orders'` nel filtro realtime), `useLiveSubmissions.js`,
`useSongRequests.js`, `useLiveSettings.js`, `useVenueSettings.js`, `usePartyFerieRealtime.js`,
`StaffDashboard.jsx:105`, `LiveTvScreenWalrusPoster.jsx:80` — tutti parametri `table:` dell'API Supabase.

**B. Modulo Jukebox — i tavoli sono un concetto di prodotto REALE lì**, non legacy, non toccare:
`CustomerEntry.jsx`, `CustomerRequest.jsx`, `PartyFerieRequest.jsx`, `StaffDashboard.jsx`,
`LiveTvScreenBranded.jsx`, `LiveTvScreenWalrusPoster.jsx`, `src/data/mockData.js` (area protetta),
`src/index.css` (`.table-badge`, `.btn-change-table`, `.tv-table-badge`).

**C. Kitchen — `order.table` ancora letto/renderizzato, ma ormai sempre vuoto** — *residuo reale, non chiuso*:
| File | Riga | Cosa fa oggi |
|---|---|---|
| `src/pages/StoricoView.jsx` | 143 | `<span className="ksd-row-table">{order.table}</span>` → pill giallo vuoto sugli ordini reali |
| `src/pages/KitchenOrdersView.jsx` | 119 | idem |
| `src/pages/AlertView.jsx` | 48-52, 88, 131 | intera sezione allergeni **raggruppata per `o.table`** → con `table` nullo tutti gli ordini collassano in un unico gruppo vuoto |
| `src/pages/KitchenTvScreen.jsx` | 7 | `order.nickname \|\| order.table \|\| 'Sconosciuto'` → fallback innocuo |
| `src/pages/CustomerOrderStatus.jsx` | 93, 286 | matching "stesso cliente" via `o.table === 'T'+session.table` → ramo morto, il fallback `nickname` regge |
| `src/pages/CustomerOrderStatus.jsx` | 601, 612 | bridge Jukebox `navigate('/request?table=' + (order.table \|\| '') ... \|\| '7')` → **finisce sempre sul fallback hardcoded `7`** |
| `src/data/kitchenMockData.js`, `kitchenSoloPreviewFixtures.js`, `kitchenSoloDemoFixtures.js` | varie | fixture demo/preview con `table: 'T3'` ecc. — mascherano il problema in demo, dove i pill appaiono pieni |
| `src/pages/KitchenStaffDashboard.css` | 236 | `.ksd-row-table` — classe ora usata solo da A/C sopra |

**Nessuno di questi 8 file era nella lista dei 5 file attesi della run**: non sono stati toccati.
Sono il residuo esplicito da chiudere in una run successiva (vedi §6).

---

## 4. REGRESSIONS

**Regressioni introdotte da questa run: ZERO.** I 5 test falliti si dividono in due gruppi, entrambi
pre-esistenti, entrambi dimostrati contro `HEAD`:

### 4.1 Falliti per il diff Sprint 3B **già nel working tree prima di questa run** (3)

| Test | Assert | Causa provata |
|---|---|---|
| `kitchen-solo-service.spec.js:51` "1. tablet: KPI PAGA/DA FARE/PRONTI" | `getByText('DA PAGARE', {exact:true})` | `git show HEAD:KitchenSoloService.jsx` → righe 67/496 dicevano `'DA PAGARE'`; il working tree (Sprint 3B, pre-run) le ha rinominate `'DA INCASSARE'` (righe 68/505). Il test non è stato aggiornato. |
| `kitchen-solo-service.spec.js:97` "4. pagamento rapido" | `kpi-paga` atteso `0`, ricevuto `1` | Log webserver: `Counter payment RPC failed — order not marked paid {"code":"P0001","message":"order_not_found"}`. HEAD chiamava `confirmPayment(order.id,'counter')` fire-and-forget; il working tree pre-run chiama `await confirmPayment(order.id,'cash')` sulla RPC reale, che non trova gli ordini mock E2E. Comportamento *corretto* (non spaccia il fallimento per successo), test/fixture non allineati. |
| `customer-kitchen-flow.spec.js:389` "7. Bancone conferma pagamento" | `getByRole('button',{name:/PAGATO/i})` | `git show HEAD:CounterOrdersView.jsx:229` → `PAGATO ✓`. Il working tree pre-run l'ha splittato in `CONTANTI ✓` / `CARTA/POS ✓`. Il mio diff su questo file tocca solo l'import e i 2 span `ksd-row-table`, mai il bottone. |

### 4.2 Falliti per il lavoro **promo già committato** in `80b0c46` (2)

| Test | Assert | Causa provata |
|---|---|---|
| `customer-kitchen-flow.spec.js:135` "3c. Empty cart bar" | `getByText('0 prodotti')` non trovato | `src/pages/CustomerKitchenMenu.jsx` è **pulito in `git status`** (= identico a HEAD) e `grep "prodotti"` su quel file non dà **nessuna** occorrenza. La stringa è sparita con il redesign promo committato, non in questa run. |
| `customer-kitchen-flow.spec.js:168` "3e. All panini sold out" | idem | Stessa causa, stessa riga di asserzione. |

Promo è esplicitamente fuori scope per questa run → non corretto, non ampliato lo scope, come richiesto.

### 4.3 Cosa NON è rotto dal cleanup
Nessun test asseriva `AL TAVOLO`, `ASPORTO`, `ksd-row-table`, `kss-qcard-line1`, `RITIRO`, `ost-info-*`
o `/kitchen/entry` (verificato con grep su `tests/`). I 15+23 test verdi coprono coda, focus, undo,
sync-failure, audio Sprint 3A (16, 17 verdi), stato ordine cliente e dashboard staff: tutti passano dopo il cleanup.

---

## 5. READY_FOR_RUNTIME_CERTIFICATION

**NO.**

Il codice è allineato al contratto no-tables e la baseline è pulita, ma la certificazione runtime
non è raggiungibile oggi per tre ragioni distinte, nessuna delle quali risolvibile da dentro questa run:

1. **5 test E2E rossi (pre-esistenti)** — 3 da allineare al diff Sprint 3B (rinomina `DA INCASSARE`,
   split `CONTANTI`/`CARTA/POS`, fixture RPC per il quick-pay), 2 da allineare al redesign promo committato.
   Finché sono rossi non esiste un "verde di riferimento" da certificare. Richiedono un Gate 1 su
   `tests/e2e/` (+ eventualmente sulle fixture), non concesso in questa run.
2. **Certificazione Realtime multi-device** — bloccata dal sandbox (redazione di
   `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`), già documentata in `sprint3b-closure-plan.md` §5.2.
   Richiede Eros da terminale reale.
3. **Ledger migration disallineato** (§3.9 del closure plan) — 3 file su 4 con versione locale ≠ remota,
   2 non idempotenti: qualunque `supabase db push` fallirebbe oggi. Non blocca l'app, blocca il tooling.

Fase A e Fase B sono chiuse per quanto era in scope: build verde, unit 5/5 + 2/2 verdi, lint senza
nuovi errori, legacy tavoli/asporto rimosso e verificato per grep, redirect provato a runtime.

---

## 6. FILES_PENDING

Ordinati per priorità, ognuno richiede un Gate 1 dedicato (nessuno toccato in questa run):

1. **`tests/e2e/kitchen-solo-service.spec.js`** — allineare `'DA PAGARE'` → `'DA INCASSARE'` (test 1) e
   decidere come far superare il quick-pay al test 4 (fixture con ordine reale, o mock della RPC:
   il codice attuale è corretto, è il test a mancare di un ordine che la RPC possa trovare).
2. **`tests/e2e/customer-kitchen-flow.spec.js`** — allineare il test 7 ai bottoni `CONTANTI ✓` /
   `CARTA/POS ✓`; allineare i test 3c/3e alla copy reale della cart bar post-promo.
3. **`src/pages/AlertView.jsx`** — il raggruppamento allergeni per `o.table` è la conseguenza funzionale
   più concreta del no-tables ancora aperta (con `table` nullo tutti gli ordini finiscono in un gruppo unico).
   Va ripensato su `orderCode`/`nickname`.
4. **`src/pages/StoricoView.jsx`, `src/pages/KitchenOrdersView.jsx`** — rimuovere il pill
   `ksd-row-table` ormai vuoto (stessa modifica già applicata a `CounterOrdersView.jsx`).
5. **`src/pages/CustomerOrderStatus.jsx`** (righe 93, 286, 601, 612) — matching "stesso cliente" e bridge
   Jukebox `?table=` con fallback hardcoded `'7'`: da ridisegnare senza `table`.
6. **`src/data/kitchenMockData.js`** (area protetta), `kitchenSoloPreviewFixtures.js`,
   `kitchenSoloDemoFixtures.js` — fixture con `table: 'T3'`: da ripulire perché demo e realtà divergono.
7. **`src/pages/KitchenStaffDashboard.css`** — `.ksd-row-table` da rimuovere quando i punti 4 e 6 sono chiusi.
8. **Test permanente del redirect** — promuovere i 2 test ad-hoc di §2.2 in `tests/e2e/`, così che
   `/kitchen/entry` resti coperto da regressione.
9. **Riconciliazione ledger migration** — invariato rispetto al closure plan §3.9, decisione tecnica
   pendente (eliminare vs no-op guardato) prima di qualunque `db push`.

---

## 7. Quality Gates

- **Scope**: 6 file toccati, tutti nella lista approvata (5 modificati + 1 eliminato). Zero file extra.
- **Aree protette**: `src/App.jsx`, `package.json`, migration, RPC/Supabase, `mockData.js`, config Vite/deploy — **non toccati**.
- **Minimalità**: `useCustomerSession.js` torna identico a HEAD; gli altri diff sono import + righe di label.
  L'unico file riscritto (`CustomerKitchenEntry.jsx`) lo è per decisione esplicita di Eros.
- **Build/test**: build PASS, unit 5/5 + 2/2 PASS, E2E senza regressioni nuove (dimostrato contro HEAD).
- **Sicurezza**: nessun secret letto/scritto/stampato; nessuna chiamata di rete iniziata dalla run;
  il dev server esterno su :5174 non è stato ucciso.
- **Git**: nessun `add`/`commit`/`push`/`restore`/`reset`. Working tree lasciato dirty e ispezionabile.

## 8. Diff Risk Review

| File | Perché | In scope | Rischio |
|---|---|---|---|
| `src/lib/kitchenOrderContext.js` (eliminato) | Legacy per intero | Sì | **Nullo** — untracked, nessun import residuo (grep verde) |
| `src/hooks/useCustomerSession.js` | Rimosso `fulfillmentType` | Sì | **Nullo** — ora identico a HEAD |
| `src/pages/CustomerKitchenEntry.jsx` | Route → redirect | Sì (decisione Eros) | **Basso** — verificato a runtime 2/2; `replaceState` evita il loop col Back |
| `src/pages/CounterOrdersView.jsx` | −import, −2 span | Sì | **Basso** — cosmetico; il codice ordine resta visibile allo staff |
| `src/pages/CustomerOrderStatus.jsx` | Label statica `AL BANCO` | Sì | **Basso** — cella mantenuta per non rompere la griglia 2×2 |
| `src/pages/KitchenSoloService.jsx` | −import, −2 label + separatori orfani | Sì | **Basso** — 15/17 E2E verdi, i 2 rossi provati pre-esistenti |

**Edit inattesi: nessuno.** `PaymentsView.jsx` e `tests/e2e/kitchen-solo-service.spec.js` risultano ancora
modificati in `git status` ma provengono dal diff Sprint 3B pre-esistente, non da questa run.

## 9. Rischi residui

- `AlertView.jsx` raggruppa gli allergeni per `table` nullo: è il residuo con impatto funzionale reale
  ancora aperto (§6 punto 3).
- Il bridge Jukebox da `CustomerOrderStatus.jsx` manda tutti al tavolo `7` hardcoded.
- Demo/preview fixtures mostrano ancora i tavoli: una demo può sembrare "giusta" mentre il flusso reale non lo è.
- I 2 unit test Kitchen restano non wired a `package.json` (nessuno script aggiunto, come richiesto):
  rischio di regressione silenziosa.

## 10. Cosa approva Eros

1. Il cleanup legacy sui 6 file (Fase A) così com'è.
2. La scelta `AL BANCO` come label statica della cella RITIRO (alternativa: eliminare la cella e ridisegnare la griglia).
3. Il prossimo Gate 1: allineamento dei 5 test E2E rossi (§6 punti 1-2) — è il vero blocco verso la certificazione.
4. Se e quando aprire il residuo `order.table` nelle 8 location di §3.2-C.

**CHECKPOINT.md da aggiornare: SÌ** (Fase A chiusa, Fase B eseguita, `READY_FOR_RUNTIME_CERTIFICATION: NO`
con i 3 blocchi di §5) — non aggiornato in questa run, richiede approvazione.
