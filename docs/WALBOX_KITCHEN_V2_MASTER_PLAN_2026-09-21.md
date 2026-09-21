# WALBOX KITCHEN V2 — MASTER PLAN CANONICO
**Versione:** 1.0  
**Data:** 2026-09-21  
**Stato:** ATTIVO — fonte canonica operativa per la costruzione di Walbox Kitchen V2

---

## 1. SCOPO

Questo file definisce il piano operativo canonico per trasformare l’attuale Walbox Kitchen in **Walbox Kitchen V2**:

- codice più pulito, snello e Kitchen-only;
- nessun runtime Fanta/Jukebox/Spotify/Party Ferie/TV legacy;
- sviluppo locale sicuro, senza possibilità di scrivere sul Supabase production;
- feature attuali preservate;
- hardening tecnico, pagamenti, notifiche, GDPR/privacy, sicurezza, test e osservabilità prima del go-live;
- sostituzione della `main` solo quando V2 è completa, verificata e approvata.

**Non stiamo creando una seconda app.**  
Stiamo costruendo la nuova base ufficiale della stessa Walbox Kitchen, mantenendo il backend production e il progetto Vercel già esistenti.

---

## 2. REGOLA DI VERITÀ

Ordine di priorità quando due fonti sembrano contraddirsi:

1. repo/runtime/test correnti;
2. evidence e report generati dal repo;
3. questo Master Plan;
4. source reset / current state più recenti;
5. documentazione storica;
6. memoria/chat precedenti.

Se questo file dice che una feature è completa ma il repo dimostra il contrario, **vince il repo**.

---

## 3. TOPOLOGIA TARGET

### Sviluppo

```text
Mac
└── walbox-kitchen-release
    └── Kitchen V2 Clean Baseline
        ├── UI / codice locale
        ├── mock data DEV
        └── nessuna connessione al Supabase production
```

### Produzione futura

```text
GitHub main
└── Walbox Kitchen V2
    ↓
Vercel production esistente
    ↓
Supabase Walbox production esistente
```

Il database production **non viene ricostruito**.  
Il cutover finale sostituisce il codice applicativo, non l’infrastruttura dati.

---

## 4. PRODUZIONE ATTUALE — DA NON TOCCARE FINO AL CUTOVER

### Vercel
Progetto production esistente:

`walbox-from-zero-v2`

Production verificata su:

`main @ 5cefe50`

La Clean Baseline V2 **non è production**.

### Supabase
Progetto Walbox production:

`pcrqfdzipotprqtuemso`

Questo ref è **vietato in ambiente DEV locale**.

---

## 5. BRANCH E CHECKPOINT IMPORTANTI

### Clean Baseline V2

Branch di sviluppo corrente:

`kitchen-clean-baseline-v2-phase-a`

Base cleanup:

`5400b5e8bef5c9773f826b7d68ada4dea0f65677`
`chore(kitchen): remove legacy non-kitchen runtime`

Test alignment locale:

`16cfabc61579036016297c609e89067f6403c49f`
`test(kitchen): align e2e with kitchen-only entry flow`

Micro-fix locali successivi:
- title browser → `Walbox Kitchen — The Walrus Pub`;
- id/name input login;
- id/name nota cassa;
- nessun cambio logico.

### Serata Operativa — WIP preservato

Branch:

`wip/kitchen-serata-operativa`

Commit:

`c44fa0c`

Contiene il lavoro già preservato su:
- service window 06:00 → 06:00 Europe/Rome;
- query pagamenti/ordini per serata reale;
- Storico basato su Payment Hub;
- label “Cassa serata”;
- test pertinenti già passati.

**Non va perso.**  
Va riportato sulla Clean Baseline solo dopo il gate corretto.

---

## 6. COSA È GIÀ STATO RIMOSSO DAL RUNTIME

La Clean Baseline ha eliminato dal frontend/runtime applicativo:

- FantaWalrus;
- Jukebox legacy;
- Spotify legacy;
- Party Ferie;
- vecchie schermate TV non-Kitchen;
- asset legacy collegati;
- vecchi flow `/entry → /request` non più necessari;
- test dipendenti dalla vecchia architettura.

Restano da preservare come dominio Kitchen:

- customer menu;
- nome cliente;
- carrello;
- ordine;
- pagamento;
- order status;
- staff;
- Solo Service;
- Cassa;
- Kitchen TV;
- Payment Hub;
- report/storico;
- notifiche;
- auth e infrastruttura necessaria.

---

## 7. STATO CLEAN BASELINE

### Validazioni già ottenute

- build PASS;
- unit test PASS;
- diff check PASS;
- Kitchen E2E confrontati A/B con `main`;
- regressioni cleanup reali: **0**;
- regressioni residue identificate come environment/local setup;
- runtime visual QA effettuato;
- title legacy corretto;
- warning a11y login/cassa corretti.

### Limite noto

`/kitchen/payments` richiede sessione staff Supabase reale per rendering completo.

Questo non è un regression blocker della Clean Baseline.

---

## 8. INCIDENTE DEV → PRODUCTION E FIX P0

È stato verificato che `.env.local` sul Mac puntava al Supabase production.

Conseguenza:
- test locali hanno scritto ordini veri nel backend Walrus;
- ordini test `A02` e `A03` sono stati individuati e rimossi completamente dal DB;
- relativi items, payments, action log e view di reconciliation sono stati ripuliti.

### Protezione applicata

`.env.local`:
- rimosso `VITE_SUPABASE_URL` production;
- rimossa anon key production.

`src/lib/supabaseClient.js`:
- aggiunto guard DEV fail-fast sul ref production:

`DEV_PRODUCTION_SUPABASE_BLOCKED`

Verifica:
- 0 richieste network verso `*.supabase.co` in DEV;
- build PASS.

### Regola permanente

**Mai test manuali locali contro il Supabase production.**

---

## 9. DEV MODE DELLA V2

Decisione corrente:

**non installare Docker e non creare staging cloud adesso.**

Per sviluppo ordinario:

- UI;
- componenti;
- layout;
- logica client;
- analytics/report;
- test mock;
- fixture;
- scenari di serata;

si usano **mock data DEV isolati**.

Il mock layer deve essere:
- separato dal codice production;
- facilmente attivabile/disattivabile;
- compatibile con le stesse shape dati usate dalla Kitchen reale;
- impossibile da attivare accidentalmente in production.

---

## 10. MOCK DATASET “SERATA WALRUS”

Creare un dataset DEV realistico per validare V2 senza backend live.

Scenario minimo consigliato:

- 50–100 ordini;
- cash;
- POS/manual card;
- SumUp online;
- pending counter payment;
- cancellati;
- ordini prima e dopo mezzanotte;
- eat here;
- takeaway;
- nomi cliente;
- note ordine;
- tempi preparing/ready/delivered;
- ordini rapidi e ordini lenti;
- più categorie prodotto;
- importi diversi;
- casi limite utili per report e storico.

Obiettivo:

**poter sviluppare e verificare Report Serata / Storico / analytics senza scrivere un singolo record sul DB del bar.**

---

## 11. ROADMAP WALBOX KITCHEN V2

### FASE 0 — CLEAN BASELINE
**Stato: sostanzialmente completata**

- runtime Kitchen-only;
- legacy runtime rimosso;
- test riallineati;
- micro-cleanup title/a11y;
- DEV production guard.

Gate:
`ZERO_CLEANUP_REGRESSIONS`

---

### FASE 1 — FINAL KITCHEN-ONLY AUDIT
**Stato: da fare**

Audit read-only di:

- route;
- componenti;
- hooks;
- assets;
- dependencies;
- import;
- riferimenti legacy;
- browser/runtime bundle.

Obiettivo:

`ZERO_RESIDUI_RUNTIME_NON_KITCHEN`

Non cancellare migrations Supabase o history DB in questa fase.

---

### FASE 2 — DEV MOCK LAYER
**Stato: da fare**

Costruire:

- mock provider DEV;
- dataset Serata Walrus;
- fixture deterministic;
- switch sicuro DEV-only;
- test per garantire che production non possa usare mock.

Gate:

`LOCAL_DEV_SAFE_WITHOUT_SUPABASE_PRODUCTION`

---

### FASE 3 — SERATA OPERATIVA
**Stato: WIP preservato**

Portare sulla Clean Baseline il lavoro:

`wip/kitchen-serata-operativa @ c44fa0c`

Validare:

- service night 06:00 → 06:00;
- mezzanotte;
- DST;
- pagamenti reali vs order total;
- storico coerente.

Gate:

`SERATA_LOGIC_PASS`

---

### FASE 4 — DASHBOARD / STORICO / REPORT SERATA
**Stato: da fare**

Obiettivo UX staff/manager:

mostrare ciò che Walbox ha registrato, non inventare “anomalie” automatiche.

Minimo:

- totale pagato;
- cash;
- POS/carta al banco;
- SumUp online;
- ordini pagati;
- ordini cancellati;
- finestra serata corretta.

Fonte incasso:
**successful `kitchen_payments`**, non semplice somma di `order.total`.

Gate:

`REPORT_SERATA_RECONCILIABLE`

---

### FASE 5 — PAYMENT CANCEL HARDENING
**Stato: da fare**

Problema da risolvere:

un checkout SumUp `initiated/pending` non deve restare aperto se ordine viene cancellato o convertito a pagamento al banco.

Comportamento target:

1. verifica server-side stato SumUp;
2. se già paid → reconcile;
3. se unpaid/pending → chiudi/cancella attempt;
4. solo dopo procedi con cancel/switch.

Gate:

`NO_ORPHAN_PAYMENT_ATTEMPTS`

---

### FASE 6 — WEB PUSH / NOTIFICHE
**Stato: da fare**

Nuovo audit + implementazione.

Non assumere che vecchie branch Web Push esistano ancora.

Definire:
- destinatari;
- trigger;
- permessi;
- opt-in;
- fallback;
- failure handling;
- token lifecycle;
- privacy.

Gate:

`NOTIFICATIONS_SAFE_AND_TESTED`

---

### FASE 7 — AUDIT TECNICO V2
**Stato: da fare**

Controllare:

- architettura;
- error handling;
- loading state;
- race condition;
- retry;
- realtime;
- offline/failure behavior;
- bundle;
- performance;
- logging;
- observability;
- dependency hygiene;
- dead code;
- console warnings/errors.

Gate:

`TECHNICAL_AUDIT_PASS`

---

### FASE 8 — SECURITY / AUTH / RLS
**Stato: da fare**

Audit:

- auth staff;
- anon customer flows;
- Supabase RLS;
- RPC authorization;
- secrets;
- client exposure;
- privilege boundaries;
- payment paths;
- input validation;
- prompt/tool injection non pertinente al runtime ma rilevante ai workflow AI;
- dev/prod isolation.

Nessuna modifica DB production senza audit + approval dedicato.

Gate:

`SECURITY_SANITY_PASS`

---

### FASE 9 — GDPR / PRIVACY
**Stato: da fare**

Definire e verificare:

- dati personali realmente raccolti;
- finalità;
- minimizzazione;
- retention;
- nickname/nome cliente;
- analytics;
- notification token;
- log;
- cancellazione/retention policy;
- privacy notice;
- eventuale consenso dove richiesto;
- accesso staff ai dati;
- terze parti coinvolte.

Questa fase richiede verifica normativa aggiornata prima del go-live.

Gate:

`GDPR_REVIEW_COMPLETE`

---

### FASE 10 — FULL REGRESSION
**Stato: da fare**

Eseguire:

- unit;
- integration;
- E2E;
- customer flow;
- cassa;
- solo service;
- staff;
- TV;
- payments;
- report;
- notifications;
- midnight/service-night;
- failure cases.

Gate:

`FULL_REGRESSION_PASS`

---

### FASE 11 — FINAL PREVIEW / HUMAN APPROVAL
**Stato: da fare**

Preview finale completa.

Eros verifica manualmente:

- Customer;
- Staff;
- Solo Service;
- Cassa;
- TV;
- Payments;
- Storico;
- Report Serata;
- notifiche;
- flussi pagamento.

Gate:

`HUMAN_APPROVAL = YES`

---

### FASE 12 — CUTOVER
**Stato: bloccato fino ai gate precedenti**

Solo dopo approval:

1. commit finale;
2. push branch;
3. PR/merge su `main`;
4. Vercel production deploy;
5. stesso Supabase production esistente;
6. smoke test production controllato;
7. test reale al Walrus.

Niente force push.

Gate:

`PRODUCTION_CUTOVER_APPROVED`

---

## 12. COSA NON FARE

Finché V2 non è approvata:

- non sostituire `main`;
- non deployare V2 in production;
- non usare Supabase production per test locali;
- non fare `supabase db push` alla cieca;
- non cancellare migrations storiche;
- non pulire schema/database solo perché il frontend è stato ripulito;
- non modificare env production senza approval;
- non aprire scope nuovi non necessari alla V2.

---

## 13. SUPABASE HYGIENE — FASE SEPARATA

Il cleanup runtime **non implica** cleanup schema/database.

Esiste un rischio noto di migration ledger remoto desincronizzato.

Quindi:

- niente `supabase db push` indiscriminato;
- niente cancellazione migrations storiche;
- eventuale cleanup DB/schema solo con audit dedicato successivo.

Nome fase futura:

`SUPABASE_HYGIENE_AUDIT`

---

## 14. APPROVAL GATES OBBLIGATORI

Human approval richiesto prima di:

- scrittura su DB production;
- migrations production;
- auth changes;
- env/secrets;
- deploy;
- merge su `main`;
- git push finale;
- cancellazioni irreversibili;
- automazioni esterne;
- cleanup schema;
- modifiche Payment Hub production.

---

## 15. FONTI CANONICHE DI SUPPORTO

Usare come fonti primarie, oltre al repo corrente:

- `00_SOURCE_RESET_AI_FACTORY_V3_2026-08-21(2).md`
- `01_MASTER_OPERATING_MODEL_AI_FACTORY_V3(1).md`
- `HERMES_RUNTIME_CURRENT_STATE_2026-08-21(1).md`
- `WALBOX_ECOSYSTEM_CURRENT_STATE_2026-08-21(1).md`
- `WALBOX_KITCHEN_SOLO_SERVICE_MODE_CURRENT_STATE_2026-08-26(1).md`
- `WWALBOX_PAYMENT_HUB_SUMUP_ONLINE_CANONICAL_SOURCE_2026-08-28.md`
- `03_CLAUDE_CODE_RUNTIME_POLICY_V1_2026-09-07.md`

Non riaprire vecchi research pack salvo necessità concreta.

---

## 16. NEXT STEP CANONICO

Il prossimo lavoro da eseguire è:

### STEP A
**Final Kitchen-only runtime audit — read-only**

Scopo:
verificare che nella Clean Baseline non siano rimasti runtime/import/asset/dependency non Kitchen.

### STEP B
**DEV Mock Layer + Serata Walrus dataset**

Solo dopo audit PASS.

### STEP C
**Integrare `wip/kitchen-serata-operativa@c44fa0c`**

Poi iniziare Dashboard/Storico/Report Serata.

---

## 17. PROMPT PER CHAT FRESCA

Usare questo messaggio per ripartire in una nuova chat:

> Usa `WALBOX_KITCHEN_V2_MASTER_PLAN_2026-09-21.md` come fonte canonica operativa per Walbox Kitchen V2.
>
> Regola: repo/runtime/test correnti hanno precedenza sul file se emerge una contraddizione.
>
> Non riaprire vecchie chat o research pack salvo necessità.
>
> Production `main`, Vercel e Supabase live non si toccano senza gate esplicito.
>
> Partiamo dal `NEXT STEP CANONICO` e procediamo in micro-fasi, audit/read-only prima delle modifiche rischiose.
>
> Per i prompt Claude usa Save-Token Strict e indica sempre: Livello, Modello, Effort, `/clear`, Modalità, Motivo.

---

## 18. DEFINIZIONE DI DONE V2

Walbox Kitchen V2 è pronta a sostituire `main` solo quando:

- runtime è Kitchen-only;
- mock/dev safety è attiva;
- Serata Operativa è integrata;
- Report Serata è affidabile;
- Payment Cancel Hardening è chiuso;
- notifiche sono testate;
- audit tecnico è PASS;
- security/auth/RLS è PASS;
- GDPR/privacy review è completata;
- regression suite è PASS;
- preview finale è approvata da Eros;
- piano cutover è esplicitamente approvato.

Fino ad allora:

**V2 resta una linea di sviluppo separata. Production resta stabile.**
