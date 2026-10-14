# WALBOX PRODUCTIZATION SPRINT V1
> Documento operativo per trasformare il pack strategico Walbox Ho.Re.Ca. Product OS in una roadmap V1 vendibile.  
> Data: 2026-06-22  
> Mode: PRODUCT STRATEGY + EXECUTION PLANNING  
> NO CODE in questo file. Implementazione solo dopo approvazione fase per fase.

---

## 1. Obiettivo dello sprint

Portare Walbox da “prodotto promettente” a **V1 competitivo e vendibile** per piccoli locali italiani.

Non serve costruire tutto il Venue Experience OS ora.
Serve chiudere una prima versione reale che possa essere mostrata, testata e venduta a:

- pub;
- bar;
- gelaterie;
- caffetterie;
- piccoli locali con banco/cucina/ritiro.

### Obiettivo pratico

Alla fine dello sprint dobbiamo poter dire:

> “Walbox non è una demo. È un sistema QR/order/kitchen bello, chiaro e operativo, che lavora sopra la cassa esistente e prepara il locale a pagamenti, loyalty e dashboard valore.”

---

## 2. Posizionamento finale V1

Walbox non si posiziona come gestionale completo.
Walbox non si posiziona come semplice QR menu.
Walbox non si posiziona come sostituto della cassa.

### Posizionamento corretto

> **Walbox è la mini-app esperienziale del locale: il cliente entra dal QR, ordina, segue lo stato, interagisce con il brand del locale e lo staff lavora meglio.**

### Versione commerciale breve

> “Non ti chiedo di cambiare cassa. Ti do una mini-app del tuo locale per menu, ordini, cucina e stato cliente. Bella, veloce e pronta per il servizio.”

### Versione contro competitor

| Competitor | Dove vince oggi | Dove Walbox deve vincere |
|---|---|---|
| Qromo | QR/order/pay, POS, fiscalità, report | mini-app più brandizzata, più semplice, più emozionale |
| Cassa in Cloud | POS, fiscale, gestionale, hardware | layer leggero sopra la cassa esistente |
| Tilby | POS cloud, hardware, integrazioni | front-office cliente più bello e immediato |
| Tavolinux | operatività locale, cassa, comande | UX cliente, visual, onboarding, semplicità |
| Loyalty/quiz/social wall tool | singola funzione verticale | esperienza unica collegata a ordine, TV e dashboard |

---

## 3. ICP V1 — cliente ideale

### ICP primario

Piccolo locale italiano con:

- 20–80 coperti;
- gestione diretta del proprietario;
- cassa già esistente;
- staff piccolo;
- bisogno di ridurre caos ordini;
- desiderio di sembrare moderno;
- paura di gestionali troppo pesanti;
- interesse per QR, status ordine, cucina e brand experience.

### Locali migliori per partire

1. Pub / birreria informale.
2. Bar con aperitivo o tavoli.
3. Gelateria con asporto + consumazione.
4. Caffetteria/brunch piccolo.
5. Locale eventi/pop-up.

### Clienti da evitare in V1

- Ristoranti che vogliono sostituire la cassa fiscale.
- Catene/franchising.
- Locali che pretendono RT, corrispettivi, magazzino e fattura elettronica dal giorno uno.
- Locali che non accettano nessun doppio passaggio con la cassa.

---

## 4. Tesi prodotto V1

V1 deve essere **stretta ma seria**.

Non deve sembrare un gestionale incompleto.
Deve sembrare un sistema leggero, bello e utile per una serata reale.

### Formula V1

```text
QR → menu → ordine → codice ordine → staff/kitchen → stato cliente → report base
```

### Cosa deve dimostrare V1

1. Il cliente capisce subito cosa fare.
2. Lo staff capisce subito cosa preparare.
3. Il gestore vede che Walbox genera ordini e controllo.
4. Il sistema non obbliga a cambiare cassa.
5. Il visual sembra fatto per il locale, non un template generico.

---

## 5. Scope V1 competitivo

### 5.1 Customer QR App

Obiettivo: far sembrare Walbox la mini-app ufficiale del locale.

Must-have:

- home/menu brandizzato;
- categorie menu chiare;
- prodotti con foto/prezzo/descrizione;
- allergeni/note visibili;
- carrello semplice;
- note cliente;
- scelta ordine: tavolo / banco / ritiro;
- codice ordine chiaro;
- pagina stato ordine;
- messaggio pagamento al banco chiaro.

Da migliorare se già presente:

- microcopy più umano;
- istruzioni più semplici;
- stato ordine più leggibile;
- chiarezza “vai al banco con codice ordine”.

---

### 5.2 Order / Kitchen OS

Obiettivo: reggere una serata reale senza caos.

Must-have:

- dashboard staff stabile;
- ordini separati per stato;
- ordine ricevuto / in preparazione / pronto / consegnato / annullato;
- codice ordine;
- note cliente;
- allergeni evidenti;
- totale ordine;
- timestamp;
- action log staff;
- storico ordini;
- cancellazione con motivo;
- menu availability / sold out.

Priorità alta:

- distinguere bene banco, tavolo, ritiro, asporto;
- evitare che ordini vecchi o critici si perdano;
- rendere leggibile da tablet/schermo a distanza.

---

### 5.3 Menu Management base

Obiettivo: dare al gestore controllo minimo senza dipendere dallo sviluppatore.

Must-have V1:

- vedere lista prodotti;
- attivare/disattivare disponibilità;
- sold out immediato lato cliente;
- categorie stabili;
- prezzo e nome prodotto chiari.

Non necessario in V1:

- editor menu completo;
- import CSV;
- multilingua;
- food cost;
- magazzino;
- gestione ingredienti avanzata.

---

### 5.4 Report base V1

Obiettivo: far capire al gestore che Walbox genera valore.

Must-have:

- ordini oggi;
- totale stimato/generato;
- valore medio ordine;
- prodotti più ordinati;
- ordini per stato;
- cancellati;
- pagati al banco / da pagare se applicabile;
- export non fiscale in V1.5.

Copy corretto:

> “Riepilogo ordine / report serata non fiscale.”

Da evitare:

> “Scontrino”, “corrispettivo”, “documento fiscale automatico”.

---

### 5.5 Visual / Brand System

Obiettivo: battere i competitor dove il cliente vede il prodotto.

Must-have:

- identità del locale evidente;
- font, colori, immagini coerenti;
- schermate mobile pulite;
- card prodotto leggibili;
- dashboard staff professionale;
- TV/poster screen coerente col brand;
- zero look “template SaaS generico”.

Criterio qualità:

> Un gestore deve poter dire: “Sembra fatto per il mio locale.”

---

## 6. Scope V1.5 serio

V1.5 è la fase che rende Walbox più competitivo contro Qromo/Cassa/Tilby senza diventare POS.

### 6.1 Payment Bridge

Obiettivo: cliente paga dentro Walbox, soldi al locale, fiscalità fuori.

Provider consigliati:

- Satispay Business API come primo test per bar/pub/gelaterie italiani;
- SumUp Hosted Checkout come fallback carte/wallet;
- Stripe Connect solo V2 multi-locale;
- Nexi solo se richiesto dal locale o partnerizzato.

Stati pagamento da normalizzare:

```text
payment_pending
paid
failed
cancelled
refunded
pay_at_counter
```

Regole:

- kitchen parte solo dopo `paid`, salvo scelta esplicita locale;
- punti loyalty solo dopo `paid`;
- badge staff “da battere in cassa”;
- report payment non fiscale;
- export serata.

---

### 6.2 Loyalty Light

Obiettivo: fidelizzazione semplice, non CRM pesante.

Must-have V1.5:

- punti base post-payment;
- stamp card digitale per bar/gelaterie;
- promo QR manuale;
- reward semplice;
- codice/QR reward;
- validazione staff;
- log riscatto;
- nickname/sessione come identità base.

Da evitare in V1.5:

- account obbligatorio;
- email/telefono obbligatori;
- marketing automation;
- SMS/WhatsApp campaign;
- profilazione avanzata;
- birthday reward senza consenso.

Copy cliente:

> “Hai guadagnato punti. Vuoi salvarli per la prossima volta?”

Non dire:

> “Crea account.”

---

### 6.3 Live Pulse / TV

Obiettivo: recuperare l'anima originale Walbox.

V1.5 non deve essere social wall aperto.
Deve essere Live Pulse controllato.

Must-have:

- loop TV brandizzato;
- QR visibile;
- promo attiva;
- tavolo on fire;
- mood poll semplice;
- reward moment anonimo/consensual;
- dediche o jukebox solo moderate;
- safe mode sempre attivo.

TV può mostrare:

- nickname consensual;
- tavolo/team;
- promo;
- mood;
- missione;
- punti aggregati;
- contenuti moderati.

TV non deve mostrare:

- incassi;
- telefono/email;
- dati personali;
- storico cliente;
- contenuti liberi non moderati;
- importi spesi dal tavolo.

---

### 6.4 Dashboard Value OS base

Obiettivo: vendere valore, non solo ordini.

Home gestore V1.5 ideale:

```text
Oggi Walbox ha generato:
- €X incasso confermato
- N ordini
- €Y valore medio
- Z promo usate
- P punti generati
- W reward riscattati
- Tavolo on fire: Tavolo 6
- Top prodotto: Panino + birra
```

Insight massimo 3:

1. Quale promo ha funzionato.
2. Quale prodotto ha alzato lo scontrino.
3. Cosa resta da battere/verificare in cassa.

---

## 7. Cosa NON costruire ora

Non costruire in V1:

- POS proprietario;
- fiscalità automatica;
- RT/corrispettivi;
- fatturazione elettronica;
- magazzino avanzato;
- CRM completo;
- app nativa iOS/Android;
- prenotazioni complete;
- delivery marketplace;
- multi-sede;
- integrazione cassa generica;
- social wall aperto;
- quiz engine completo;
- marketing SMS/WhatsApp/email.

Motivo:

> Queste feature fanno sembrare Walbox un gestionale incompleto. Ora Walbox deve sembrare un layer leggero, bello e vendibile.

---

## 8. Priorità prodotto immediata

### Priorità 1 — chiudere V1 operativo

Domanda guida:

> Può un piccolo locale usare Walbox in una serata reale senza panico?

Checklist:

- customer QR flow pulito;
- staff dashboard stabile;
- stati ordine chiari;
- menu availability funzionante;
- storico chiaro;
- report base;
- pagamento al banco chiaro;
- no bug critici;
- visual professionale.

---

### Priorità 2 — preparare demo commerciale

Domanda guida:

> In 5 minuti un gestore capisce perché dovrebbe provarlo?

Demo flow consigliato:

1. Scansiona QR.
2. Guarda menu brandizzato.
3. Ordina prodotto.
4. Ricevi codice ordine.
5. Staff vede ordine.
6. Cucina cambia stato.
7. Cliente vede pronto.
8. Gestore vede report base.
9. TV mostra venue experience.

---

### Priorità 3 — field test su 3 locali

Obiettivo: validare mercato, non solo prodotto.

Locali target:

1. pub/birreria;
2. bar/caffetteria;
3. gelateria.

Domande decisive:

- useresti Walbox senza cambiare cassa?
- ti basta pagamento al banco in V1?
- Satispay/SumUp ti interessano?
- stampa cucina è obbligatoria?
- pagheresti €39/mese?
- pagheresti setup brandizzato?
- la TV/live screen ti crea valore o è superflua?
- loyalty/punti ti interessano?
- cosa ti blocca davvero?

---

## 9. Roadmap sprint proposta

### Sprint A — V1 Product Audit

Output:

- lista feature già pronte;
- lista gap V1;
- lista bug/UX blockers;
- lista file caldi;
- decisione cosa entra e cosa no.

Regola:

> Read-only audit prima di ogni implementazione.

---

### Sprint B — V1 Operational Fix

Output:

- customer flow più chiaro;
- staff dashboard più leggibile;
- ordine banco/tavolo/ritiro più robusto;
- report base;
- no regressioni.

---

### Sprint C — Demo Sales Flow

Output:

- percorso demo 5 minuti;
- dati demo realistici;
- TV/poster screen coerente;
- script commerciale;
- screenshot pack.

---

### Sprint D — Field Test Pack

Output:

- scheda intervista;
- mini pitch;
- checklist locale;
- note raccolta feedback;
- pricing test.

---

### Sprint E — V1.5 Planning

Output:

- Payment Bridge scope;
- Loyalty Light scope;
- Live Pulse scope;
- Dashboard Value scope;
- priorità tecnica per Claude/Antigravity.

---

## 10. Definition of Done V1

Walbox V1 è pronto quando:

- un cliente può ordinare senza spiegazioni;
- staff vede e gestisce ordini senza confusione;
- il gestore vede almeno ordini/totale/top prodotti;
- il sistema distingue pagamento banco / stato ordine;
- menu availability funziona cross-session;
- la UI è abbastanza bella da mostrarla a un locale reale;
- esiste uno script demo commerciale;
- esiste una procedura fallback in caso di problema;
- non promette fiscalità, POS o scontrino automatico;
- il prodotto può essere spiegato in una frase.

Frase finale:

> “Walbox lavora sopra la tua cassa: fa ordinare meglio, gestire meglio la cucina e mostrare ai clienti un'esperienza più moderna.”

---

## 11. Prompt operativo per Claude / Antigravity

### Prompt 1 — Audit V1 Productization

```text
MODE: READ-ONLY AUDIT.
NO CODE. NO FILE EDITS.

Contesto:
Sto trasformando Walbox Kitchen in V1 competitivo vendibile per piccoli locali italiani.
Non dobbiamo costruire POS/fiscale.
Walbox deve essere layer QR/order/kitchen sopra la cassa esistente.

Obiettivo audit:
Verifica lo stato reale del codebase rispetto a WALBOX_PRODUCTIZATION_SPRINT_V1.md.

Controlla solo:
- customer QR/menu/order/status flow;
- staff/kitchen dashboard;
- menu availability;
- storico/report base;
- pagamento al banco/stato pagamento se presente;
- TV/poster screen solo come demo sales asset;
- eventuali test e build.

Output richiesto:
1. cosa è già pronto per V1;
2. cosa manca per V1 competitivo;
3. bug/blocker seri;
4. file coinvolti;
5. micro-fasi consigliate, massimo 5;
6. stop condition.

Non modificare file.
Non proporre refactor ampi.
Non toccare App.jsx senza motivo esplicito.
```

---

### Prompt 2 — Piano micro-fasi V1

```text
MODE: PHASE PLAN ONLY.
NO CODE.

Usa l'audit V1 appena completato.
Spezza il lavoro in micro-fasi chirurgiche.
Ogni fase deve avere:
- obiettivo;
- file autorizzati;
- cosa NON toccare;
- test/build da eseguire;
- output atteso;
- commit message suggerito.

Priorità:
1. blocchi operativi V1;
2. customer/staff clarity;
3. report base;
4. demo sales flow;
5. visual polish solo se non rompe logica.

Proteggi:
- App.jsx;
- Supabase auth/env;
- pagamento/provider;
- fiscalità/POS non inclusi.
```

---

### Prompt 3 — Sales Demo Pack

```text
MODE: PRODUCT DEMO PACK.
NO CODE unless explicitly approved after plan.

Obiettivo:
Creare un demo flow vendibile di Walbox V1 per pub/bar/gelateria.

Output richiesto:
1. percorso demo in 5 minuti;
2. dati demo realistici;
3. cosa mostrare al cliente;
4. cosa NON promettere;
5. obiezioni attese e risposte;
6. screenshot list da preparare;
7. pitch breve per gestore.

Focus:
Walbox non sostituisce la cassa.
Walbox migliora QR/order/kitchen/status e prepara pagamento/loyalty/dashboard valore.
```

---

## 12. Master file da aggiornare dopo sprint

Dopo lo sprint, aggiornare:

- `00_MASTER_CONTEXT.md`
- `03_FEATURE_MATRIX_MASTER.md`
- `05_FIELD_RESEARCH_MASTER.md`
- `06_WALBOX_STRATEGY_MASTER.md`
- `07_DECISION_LOG.md`
- `08_COMPETITIVE_STRATEGY_MASTER.md`
- `11_DASHBOARD_VALUE_OS_MASTER.md`

Nuovo file consigliato da aggiungere al workspace:

```text
06_ROADMAP/WALBOX_PRODUCTIZATION_SPRINT_V1.md
```

---

## 13. Decisione finale

La ricerca ora è sufficiente per partire.

Non bisogna continuare a cercare competitor prima di consolidare prodotto.

### Prossima azione corretta

```text
1. Caricare questo file nel workspace.
2. Dare a Claude/Antigravity il Prompt 1 — Audit V1 Productization.
3. Ricevere audit read-only.
4. Creare micro-fasi.
5. Implementare una fase alla volta.
6. Quality gate.
7. Diff risk review.
8. Commit.
9. Preparare demo sales flow.
10. Testare con 3 locali.
```

---

## 14. Sintesi brutale

Walbox oggi non deve diventare più grande.

Deve diventare più chiaro, più stabile, più vendibile.

La promessa V1 è:

> “Il tuo locale ha finalmente una mini-app QR bella, semplice e operativa per menu, ordini, cucina e stato cliente, senza cambiare cassa.”

La promessa V1.5 sarà:

> “In più, fai pagare dall'app, dai punti, lanci promo, accendi la TV del locale e vedi quanto valore Walbox ti ha generato.”
