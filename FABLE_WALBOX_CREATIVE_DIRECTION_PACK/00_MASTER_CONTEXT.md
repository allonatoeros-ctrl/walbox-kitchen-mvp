# 00 — MASTER CONTEXT
> Workspace: WALBOX_HORECA_PRODUCT_OS  
> Aggiornato: 2026-06-22 — dopo Consolidamento R007-R012 Experience OS

---

## Cos'è questo workspace

---

## Aggiornamento strategico — Venue Experience OS

Dopo le ricerche Tavolinux, Qromo, Cassa in Cloud e Tilby, e dopo la ridefinizione dell'idea originale Walbox, il prodotto non va più letto solo come **QR menu / order / kitchen**.

Walbox va letto come:

> **Venue Experience OS per piccoli locali italiani: customer experience + ordini + kitchen + pagamenti + loyalty + dashboard valore, sopra o accanto alla cassa esistente.**

Il QR resta il punto d'ingresso, ma non è il prodotto. Il prodotto è il mondo digitale vivo del locale: interazione, ordine, pagamento, stato, punti, promo, TV/live screen e valore misurabile per il gestore.

### Nuova architettura concettuale

| Modulo | Cosa fa | Stato strategico |
|---|---|---|
| **Experience OS** | Jukebox, nickname, mood, dediche, quiz, promo, loyalty, tavolo on fire, TV/live screen | Differenziatore principale Walbox |
| **Order / Kitchen OS** | Menu, ordini, tavoli/banco/ritiro, KDS, stati, note, allergeni, varianti | Modulo operativo da far crescere con la ricerca competitor già fatta |
| **Payment Bridge** | Satispay / SumUp / Stripe / Nexi, stato pagamento, pagamento app, riconciliazione base | V1.5/V2, senza fiscalità proprietaria iniziale |
| **Dashboard Value OS** | Vendite generate, promo convertite, loyalty, prodotti top, clienti attivi, tavoli forti | Nuovo modulo gestionale Walbox, non fiscale |
| **Fiscal / POS Integration Layer** | Cassa, RT, corrispettivi, fatture, integrazioni POS | V3/partner, non V1 |

### Decisione guida

Walbox non deve diventare subito una cassa fiscale. Deve diventare prima il sistema che dimostra al locale:

- quanti ordini ha generato;
- quanto incasso è passato da Walbox;
- quali promo hanno funzionato;
- quali clienti/tavoli hanno interagito;
- quali prodotti hanno venduto meglio;
- quanto la customer experience ha aumentato valore, controllo e fidelizzazione.

La cassa fiscale resta la verità fiscale. Walbox deve diventare la verità esperienziale, operativa e commerciale del locale.


Questo NON è il codebase di Walbox Kitchen.
È un workspace di **product strategy e market intelligence** per trasformare Walbox Kitchen in un vero competitor nel mercato Ho.Re.Ca. italiano.

Contiene ricerche grezze, analisi competitive, teardown UX, note sul campo e decisioni strategiche.

---

## Il prodotto: Walbox Kitchen

Walbox Kitchen è una piattaforma di gestione ordini e QR ordering per venue di ristorazione e pub italiani. Il primo cliente reale è **The Walrus Pub** (Milano).

### Nota di posizionamento aggiornata

Walbox Kitchen resta il primo modulo operativo, ma il nome strategico più corretto del prodotto esteso è **Walbox Venue OS**. Kitchen non viene abbandonata: diventa il pilastro operativo che collega customer app, ordini, pagamenti, loyalty e dashboard valore.


**Walbox Kitchen NON è:**
- Un prototipo visivo
- Una demo per investitori
- Un MVP usa-e-getta
- Un gestionale fiscale completo da sostituire subito alla cassa del locale

**Walbox Kitchen DEVE DIVENTARE:**
- Un prodotto SaaS scalabile per il mercato Ho.Re.Ca. italiano
- Un sistema competitivo contro Tavolinux, Qromo, Cassa in Cloud, Tilby, Dishcovery, Booxit, GloriaFood
- La base tecnica per onboardare nuovi clienti in 3-4 ore
- Un layer QR/order/kitchen bello, semplice e operativo sopra o accanto ai sistemi di cassa già presenti nei piccoli locali

---

## Mercato target

- Bar, pub, birrerie
- Gelaterie e caffetterie
- Ristoranti informali e trattorie
- Venue con ordine al tavolo, al bancone o per ritiro

**Geografia iniziale:** Italia, focus Milano e hinterland lombardo.

---

## Stack tecnologico attuale

- React + Vite (frontend)
- Supabase per ordini/menu/staff dove già integrato
- Figma → Design Tokens → CSS Custom Properties
- Antigravity IDE + Claude Code (pipeline di sviluppo)

---

## Stato ricerca competitiva

| Ricerca | Competitor | Stato | Threat level | Sintesi |
|---|---|---:|---:|---|
| 001 | Tavolinux | ✅ completata | Alta | Forte su gestionale, POS/cassa, fiscale, pagamenti, hardware, KDS, magazzino e statistiche. |
| 002 | Qromo | ✅ completata | Alta / Altissima | Forte su QR menu, order & pay, pagamenti, menu management, POS, fiscalità, report, KDS All-in-One. |
| 003 | Cassa in Cloud | ✅ completata | Alta | Benchmark TeamSystem POS/cassa/gestionale completo; fortissimo su fiscale, pagamenti, hardware, comande, KDS, report e magazzino. Utile per definire il confine tra Walbox e mondo gestionale. |
| 004 | Tilby | ✅ completata | Alta | Benchmark POS cloud/hardware/integrations Zucchetti; forte su cassa, fiscalità, pagamenti, SumUp/Satispay, Alvòlo self-order, Klancy KDS, hardware, magazzino e analytics. |
| 005 | GloriaFood | Da avviare | Media | Benchmark freemium online ordering. |

---

## Struttura del workspace

| Cartella | Contenuto |
|---|---|
| `00_PROJECT_SOURCES_TO_UPLOAD/` | File master da caricare nel ChatGPT Project |
| `01_RAW_RESEARCH/` | Ricerca grezza per ogni competitor |
| `02_SCREENSHOTS_ARCHIVE/` | Screenshot UI competitor e riferimenti visivi |
| `03_FIELD_NOTES/` | Note sul campo: bar, pub, gelaterie, interviste |
| `04_WALBOX_ANALYSIS/` | Analisi Walbox vs competitor specifici |
| `05_COMPETITIVE_STRATEGY/` | Strategia competitiva e posizionamento |
| `06_ROADMAP/` | Roadmap per fasi (V1 → V3) |
| `07_PROMPTS/` | Prompt operativi per sessioni di ricerca e analisi |
| `99_ARCHIVE/` | Materiale obsoleto o sospeso |

---

## Principio guida aggiornato

> **Battere Tavolinux su UX/onboarding, Qromo su semplicità/brand experience, e Cassa in Cloud sulla leggerezza di adozione senza inseguire subito POS/fiscale.**

Dopo le prime tre ricerche emerge una divisione chiara:

- **Tavolinux** valida il bisogno gestionale-operativo: cassa, fiscale, tavoli, comande, cucina, pagamenti, hardware.
- **Qromo** valida il bisogno QR/order/pay moderno: menu digitale, pagamento da telefono, dashboard ordini, KDS, report, POS mobile.
- **Cassa in Cloud** valida il confine gestionale/POS/fiscale: un locale che vuole sostituire la cassa cerca documenti fiscali, RT, corrispettivi, pagamenti, hardware, magazzino e integrazione commercialista.
- **Tilby** valida il modello POS cloud più moderno: multidispositivo, hardware certificato, partner payment, API e integrazioni.
- **Walbox** deve entrare dal cuneo: mini-app del locale, flusso QR/order/kitchen chiaro, onboarding rapidissimo, visual superiore e operatività sufficiente per bar/pub/gelaterie piccoli.

Non cercare la perfezione tecnica in V1. Cercare la vittoria competitiva per fasi.

---

## Confine strategico dopo Tilby

Tilby conferma che il mercato POS moderno non è solo software: è una combinazione di cassa, fiscalità, hardware, pagamenti, comande, KDS, magazzino, analytics e integrazioni partner.

**Decisione aggiornata:** Walbox deve restare cassa-agnostic in V1, ma progettare il prodotto come layer integrabile. Non deve costruire subito POS/fiscale/hardware proprietario, però deve rendere credibile la convivenza con cassa esistente tramite:

- riepilogo ordine non fiscale;
- pagamento al banco chiarissimo;
- report giornaliero base;
- stampa/export comanda in V1.5;
- pagamenti/Satispay in V1.5;
- integrazioni POS/hardware/partner in V2.

> **Tilby non sposta Walbox verso il POS proprietario. Sposta Walbox verso una strategia di integrazione e rassicurazione operativa.**

---

## Confine strategico dopo Cassa in Cloud

Walbox non deve vendersi in V1 come alternativa completa alla cassa. Deve vendersi come:

> Sistema QR/order/kitchen bello, chiaro e rapido, che può vivere sopra la cassa esistente e migliorare subito esperienza cliente e gestione ordini.

Se il cliente chiede sostituzione fiscale completa della cassa, Cassa in Cloud oggi vince. Se il cliente vuole digitalizzare menu, ordini, cucina e status senza adottare un gestionale pesante, Walbox ha spazio commerciale.


---

## Aggiornamento ricerca — Ricerca 005 Payment Bridge Italia

La Ricerca 005 ha analizzato Satispay Business API, SumUp Hosted Checkout, SumUp OAuth/Cloud API, Stripe Connect e Nexi XPay.

Decisione aggiornata:

> Walbox deve adottare un **Merchant-local Payment Bridge**: il cliente paga dentro il flusso Walbox tramite provider esterno; i soldi arrivano sul profilo business del locale; Walbox riceve lo stato pagamento e aggiorna ordine, kitchen, loyalty e dashboard; il documento fiscale resta sulla cassa/RT/procedura fiscale del locale.

### Provider per fase

| Fase | Provider | Ruolo |
|---|---|---|
| V1.5 | Satispay Business API | Primo test pagamento app |
| V1.5 | SumUp Hosted Checkout | Fallback carte/wallet |
| V2 | Stripe Connect | Scalabilità multi-locale |
| V2 | SumUp OAuth | Locali già SumUp |
| V2/V3 | Nexi XPay | Locale già Nexi / partnership |

### Impatto su architettura concettuale

| Modulo | Aggiornamento dopo R005 |
|---|---|
| Experience OS | Loyalty/punti si attivano solo dopo pagamento confermato |
| Order / Kitchen OS | Stato pagamento separato da stato cucina |
| Payment Bridge | Satispay/SumUp V1.5, Stripe/SumUp OAuth V2, Nexi V2/V3 |
| Dashboard Value OS | Incasso provider, pending/failed/cancelled, export e da-battere-in-cassa |
| Fiscal / POS Integration Layer | Resta V3/partner |

### Nuovo stato ricerca competitiva

| Ricerca | Ambito | Stato | Sintesi |
|---|---|---:|---|
| 005 | Payment Bridge Italia | ✅ completata | Satispay V1.5, SumUp fallback, Stripe Connect V2, Nexi V2/V3 |

### Prossima ricerca consigliata

**Ricerca 007 — Venue Gamification / Live Screen Engine**: capire come trasformare ordini, pagamenti, punti, tavoli e nickname in TV/live screen, classifiche, quiz, social wall e momenti di serata.

---

## Aggiornamento ricerca — Ricerca 006 Loyalty / Promo Engine

La Ricerca 006 ha analizzato modelli loyalty e promo per trasformare ordine + pagamento confermato + nickname/sessione cliente in punti, timbri, reward, promo e dashboard valore, senza trasformare Walbox subito in un CRM pesante.

### Decisione aggiornata

> Walbox deve adottare un **Loyalty Light Engine post-payment**: punti/timbri/promo/reward vengono confermati solo dopo pagamento `paid`; il cliente può partire con nickname/sessione QR senza account obbligatorio; il gestore vede punti, promo, reward e ritorno cliente nella Dashboard Value OS.

### Benchmark principali R006

| Benchmark | Lettura per Walbox |
|---|---|
| Open Loyalty | Modello event-driven/API-first da copiare come architettura V2/V3, non come complessità V1.5 |
| Paytronix / Punchh / Thanx / Como | Benchmark enterprise guest engagement e CRM restaurant, utili per V3 |
| BonusQR | Benchmark più vicino a V1.5: QR loyalty, nickname, punti, timbri, coupon, referral, piccoli merchant |
| Stamp Me / wallet stamp card | Benchmark semplicità: timbri digitali vendibili a bar/gelaterie |
| Square Loyalty / Toast Loyalty | Benchmark POS-integrated: punti al checkout, reward, KPI loyalty-attributed sales |
| Passtastic / Cuppacard / GetDoppio | Benchmark wallet/stamp card senza app, setup rapido, no POS integration |

### Provider/modelli per fase

| Fase | Loyalty model | Obiettivo |
|---|---|---|
| V1.5 | Punti base post-`paid`, stamp card, promo QR manuale, reward semplice | Vendibile subito, basso attrito, niente CRM pesante |
| V2 | Reward engine, campaign engine base, referral, badge, leaderboard tavoli, segmentazione light | Trasformare pagamento + ordine in ritorno cliente misurabile |
| V3 | CRM, tier, marketing automation, email/SMS, birthday reward, integrazioni POS/payment profonde | Loyalty avanzata solo dopo validazione commerciale |

### Regole prodotto R006

1. Nessun punto definitivo su ordine non pagato.
2. `payment_status === paid` è il trigger per punti, reward e KPI revenue/loyalty.
3. Nickname/sessione QR è l'identità base V1.5.
4. Email/telefono devono essere opzionali e separati dal consenso marketing.
5. Il reward deve essere validabile dallo staff con codice/QR e log azione.
6. Le promo devono essere misurabili: utilizzi, conversione, incasso collegato, costo reward stimato.
7. La TV/live screen può amplificare punti, badge e tavolo on fire, ma senza mostrare dati personali sensibili.
8. Walbox deve sembrare la mini-app del locale, non una fidelity card generica.

### Prossima ricerca consigliata

**Ricerca 007 — Venue Gamification / Live Screen / Social Wall Engine**: capire come trasformare loyalty, ordini, nickname, tavoli e serate in TV/live screen, giochi, classifiche, social wall, quiz e momenti live vendibili per pub/bar/gelaterie.

### Nuovo stato ricerca competitiva

| Ricerca | Ambito | Stato | Sintesi |
|---|---|---:|---|
| 006 | Loyalty / Promo Engine | ✅ completata | Loyalty Light post-payment: punti/timbri/promo/reward dopo `paid`, nickname/sessione QR, dashboard valore e privacy light |

### Impatto su architettura concettuale

| Modulo | Aggiornamento dopo R006 |
|---|---|
| Experience OS | Loyalty diventa meccanica viva: punti, badge, tavolo on fire, reward emozionali |
| Order / Kitchen OS | Ordine pagato alimenta punti e reward; reward non deve creare caos staff |
| Payment Bridge | `paid` è il trigger ufficiale per punti e promo confermate |
| Dashboard Value OS | Aggiunti KPI loyalty: punti, reward, promo conversion, ritorno cliente light |
| Privacy / CRM | V1.5 resta nickname/sessione; account e marketing automation solo V3 |

---

## Consolidamento Experience OS — R007/R012 completato

Dopo R007-R012, il blocco **Experience OS** è stato consolidato come secondo grande pilastro Walbox dopo Order/Kitchen, Payment Bridge e Loyalty Light.

### Ricerche consolidate

| Ricerca | Ambito | Decisione principale |
|---|---|---|
| **R007** | Venue Gamification / Live Screen / Social Wall | Partire con **Live Pulse Engine**, non social wall aperto |
| **R008** | Dashboard Value / Restaurant Analytics | Dashboard **value-first**, non BI/fiscale completa |
| **R009** | Venue TV / Digital Signage UX | TV come **Live Venue Channel** con loop + live interruptions |
| **R010** | Event & Quiz Engine / Mission Night | Vendere **Mission Night Light** prima di Quiz Night full |
| **R011** | Customer Identity / CRM Light | Usare **Progressive Identity Ladder**, niente account obbligatorio |
| **R012** | Retention & Community Loops | Costruire **Return Loop Engine**, non CRM marketing pesante |

### Nuova architettura Experience OS consolidata

```text
QR → sessione/nickname/tavolo → interazione leggera → ordine → pagamento paid → punti/reward → TV live moment → dashboard valore → ritorno cliente
```

### Nuovo stato strategico

Walbox non deve più essere valutato solo contro QR menu, POS e KDS. Deve essere valutato su cinque assi:

1. **Order / Kitchen OS** — flusso operativo reale.
2. **Payment Bridge** — pagamento app senza fiscalità proprietaria iniziale.
3. **Loyalty Light** — punti/timbri/reward solo dopo `paid`.
4. **Experience OS** — TV, tavoli, missioni, mood, jukebox request, live moments.
5. **Dashboard Value OS** — prova economica e operativa del valore generato.

### Decisione prodotto consolidata

> **Walbox deve diventare la mini-app esperienziale del locale: fa ordinare, pagare, partecipare, guadagnare punti e tornare, mostrando al gestore il valore generato.**

### Fasi aggiornate

| Fase | Nome | Obiettivo |
|---|---|---|
| **V1 competitivo** | Order/Kitchen reale | Menu, ordini, KDS, pagamento banco, report base |
| **V1.5 serio** | Payment + Loyalty + Live Pulse | Satispay/SumUp, punti, promo, TV live, tavolo on fire, dashboard valore |
| **V2 operativo** | Venue OS completo | Mission Night, Quiz Night, event mode, social wall moderato, wallet, report eventi |
| **V3 gestionale/CRM light** | Retention + Integration | CRM opt-in, reactivation, POS/cassa integration selezionata, campaign attribution |

### Regole non negoziabili post-R012

1. Il QR non è il prodotto: è l'ingresso nel mondo digitale del locale.
2. Nessun punto definitivo prima di `payment_status === paid`.
3. Nessun account obbligatorio per ordinare.
4. Nickname pubblico su TV solo con consenso.
5. TV mostra momenti sicuri, non dati personali o incassi.
6. Social wall aperto solo V2 e solo moderato.
7. Quiz full solo V2; V1.5 punta su Mission Night Light.
8. Marketing email/SMS/WhatsApp solo V3 opt-in.
9. Dashboard deve mostrare valore, non vanity metrics.
10. Walbox lavora sopra o accanto alla cassa esistente: fiscalità proprietaria resta fuori da V1/V1.5.

### Prossimo lavoro consigliato

Dopo il consolidamento dei master, la prossima attività non è un'altra ricerca ampia. È trasformare queste decisioni in:

- roadmap V1.5 concreta;
- feature scope per Live Pulse Core;
- mockup/prototipo TV coerente con R009;
- pitch commerciale Experience OS per Walrus/pub/bar/gelaterie;
- field research su 3 locali per validare TV, punti, missioni e ritorno cliente.

---

## Aggiornamento 2026-06-28 — Stato V1.1 pre-pilot + TV audit separato

### Stato operativo confermato

Il checkpoint `WALBOX_KITCHEN_CHECKPOINT_FINALE_V1_1.md` chiude Walbox Kitchen in stato **V1.1 pre-pilot stabilizzata**.

Stato certo:

- branch operativo: `main`;
- ultimo commit certo mergeato/pushato: `1580500 — Fix customer status bottom bar state handling`;
- ultimo test certo: `npm run pilot:check` passato con `22/22` E2E verdi;
- flusso Kitchen end-to-end operativo: QR/table entry → menu → carrello → ordine → pagamento al banco → conferma staff → cucina → pronto → consegnato → status cliente.

### Cosa è realmente validato

È validato il blocco **Order / Kitchen OS V1.1**:

- customer QR flow;
- status ordine cliente;
- pagamento al banco confermato da staff;
- dashboard staff;
- dashboard cucina/Kanban;
- storico, alert, availability e flussi base;
- visual/operational polish mobile;
- test automatici completi.

### Cosa NON è ancora validato

La **TV / Live Screen / Poster TV** resta un pilastro strategico del Venue Experience OS, ma **non risulta validata nel checkpoint V1.1**.

Decisione aggiornata:

> Kitchen V1.1 è pilot-ready controllato. TV è centrale per Walbox, ma va auditata separatamente prima di includerla nel pilot operativo.

Non assumere che la Kitchen apra automaticamente la TV. Nel pilot reale vanno distinti tre ingressi:

```text
Cliente → QR / kitchen entry
Staff / cucina → dashboard staff
TV venue → route TV/poster/live screen da verificare
```

### Prossima priorità corretta

Prima del pilot:

1. verificare `git status` e `git log --oneline -5` per confermare il micro-fix mascotte;
2. fare smoke test produzione Kitchen;
3. fare **TV Route & Data Audit** separato;
4. decidere se il pilot include TV in Safe Mode oppure se parte Kitchen-only.

### Confine operativo

Non aprire V1.5 prima del pilot. Payment, Loyalty, Live Pulse, Mission Night, Retention e Dashboard Value restano roadmap già definita, ma non vanno implementati finché V1.1 non è stata verificata in produzione/campo.

