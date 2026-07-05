# 16 — WALBOX HORECA AGENTIC PRODUCT TEAM
> Data: 2026-06-28  
> Ambito: workflow agentico / ruoli specialistici per Walbox Ho.Re.Ca.  
> Tipo: organizational strategy / agent design — nessun codice, nessuna implementazione

---

## Scopo

Questo file formalizza l'idea di trattare Walbox Ho.Re.Ca. come se fosse seguito da una vera azienda prodotto, con reparti/agent specializzati.

L'obiettivo non è creare complessità fine a sé stessa. L'obiettivo è evitare che ogni decisione venga buttata dentro un unico prompt generico, mischiando ricerca, strategia, visual, codice, QA e documentazione.

---

## Tesi

Walbox sta diventando troppo ampio per essere gestito con un solo flusso “prompt → codice”.

Il prodotto ora include:

```text
Order/Kitchen OS
Payment Bridge
Loyalty Light
Dashboard Value OS
Venue Experience OS
Live Venue Channel / TV
Brand customization
Pilot safety
Field research
Competitive intelligence
```

Quindi ha senso ragionare come una micro software house agentica:

```text
Founder / Product Owner → Orchestrator → Specialist Agents → Implementation → QA → Source Update
```

---

## Ruoli aziendali / agent consigliati

### 1. Product Strategy Lead Agent

Responsabilità:

- tiene insieme visione, roadmap e fasi V1/V1.5/V2/V3;
- decide cosa è ora e cosa è backlog;
- protegge il progetto dalla dispersione;
- traduce insight in decisioni prodotto.

Non fa:

- codice;
- visual dettagliato;
- ricerca web raw non filtrata.

Output:

- decision memo;
- scope per fase;
- priorità;
- stop condition.

---

### 2. Market Intelligence / Competitor Research Agent

Responsabilità:

- analizza competitor QR/order/pay/POS/loyalty/signage;
- separa funzioni, UX, visual, pricing, target, operatività;
- evidenzia flussi da copiare e esperienze da battere;
- mantiene aggiornati raw research e master file.

Output:

- raw research;
- competitor teardown;
- feature matrix update;
- strategic implication.

---

### 3. Venue Experience Strategist Agent

Responsabilità:

- progetta il sistema esperienza del locale;
- definisce nickname, mood, dediche, tavolo on fire, missioni, TV moments;
- protegge la differenziazione Walbox rispetto ai gestionali.

Output:

- experience concept;
- live moment map;
- customer journey;
- TV/mission/loyalty logic.

---

### 4. Brand Strategist / Copy Agent

Responsabilità:

- definisce tono, slogan, microcopy e voce del locale;
- adatta Walbox al brand del cliente;
- evita copy generico SaaS;
- mantiene coerenza tra app, TV, packaging e QR poster.

Per Walrus Kitchen:

```text
Direzione: panini ignoranti / fame educata / food brand ironico / nero-giallo / no profanity come asse principale
```

Output:

- copy system;
- slogan set;
- tone rules;
- do/don't.

---

### 5. Visual System / Creative Director Agent

Responsabilità:

- trasforma brand e reference in direzione visuale operativa;
- definisce layout, gerarchia, spacing, ritmo, component feeling;
- non implementa codice;
- produce brief visivo per frontend.

Output:

- creative brief;
- visual rules;
- layout direction;
- reference mapping.

---

### 6. Venue TV UX Agent

Responsabilità:

- progetta TV/live screen come esperienza reale da locale;
- verifica leggibilità da 3-5 metri;
- separa pickup TV, KDS cucina, poster TV e Live Venue Channel;
- definisce default loop, QR, promo, live interruptions e safe mode.

Output:

- TV UX brief;
- route purpose matrix;
- content hierarchy;
- safe mode rules.

---

### 7. Order/Kitchen Operations Agent

Responsabilità:

- protegge il flusso operativo del servizio;
- ragiona su banco, tavolo, cucina, stati, tempi, allergeni, note, ritiro;
- confronta Walbox con Qromo/Cassa/Tilby/Tavolinux come operatività.

Output:

- service flow;
- KDS rules;
- staff workflow;
- pilot checklist.

---

### 8. Payment / Fiscal Boundary Agent

Responsabilità:

- mantiene chiaro il confine pagamento/fiscalità;
- valuta Satispay, SumUp, Stripe, Nexi;
- normalizza stati pagamento;
- evita promesse fiscali non vere.

Output:

- payment bridge scope;
- provider comparison;
- fiscal stop conditions;
- staff/payment UX.

---

### 9. Dashboard Value Agent

Responsabilità:

- decide quali KPI mostrano valore al gestore;
- collega ordini, pagamenti, promo, punti, TV e ritorno cliente;
- evita dashboard vanity o BI troppo pesante.

Output:

- KPI map;
- dashboard brief;
- report serata;
- value proof.

---

### 10. Implementation Agent

Responsabilità:

- lavora nel codebase;
- modifica React/CSS solo quando riceve brief chiaro;
- non decide strategia o brand da solo;
- rispetta file protetti e stop condition.

Output:

- codice;
- diff summary;
- test commands;
- risk notes.

---

### 11. QA / Pilot Safety Agent

Responsabilità:

- verifica che il sistema regga una serata reale;
- testa route, datasource, produzione, fallback, safe mode;
- produce go/no-go per pilot.

Output:

- test plan;
- route audit;
- pilot readiness matrix;
- bug list prioritaria.

---

### 12. Documentation / Source Update Agent

Responsabilità:

- aggiorna master file;
- salva decision log;
- crea checkpoint;
- impedisce perdita di contesto tra chat, Claude, Antigravity e repo.

Output:

- master file update;
- decision log update;
- checkpoint;
- handoff prompt.

---

## Workflow consigliato per TV Walrus

```text
1. Product Strategy Lead
   decide obiettivo: pilot safe TV, non Live Venue Channel completo

2. Market Intelligence Agent
   ricerca online signage/menu board/pickup screen/restaurant TV best practices

3. Brand Strategist / Copy Agent
   consolida panini ignoranti / fame educata / tono food-brand

4. Venue TV UX Agent
   definisce layout TV: pickup + QR + promo + safe mode

5. Creative Director Agent
   traduce package nero-giallo in visual brief

6. Implementation Agent
   applica solo modifiche approvate

7. QA / Pilot Safety Agent
   verifica route, datasource, leggibilità, safe mode, produzione

8. Documentation Agent
   aggiorna fonti, decision log, checkpoint
```

---

## Ha senso farlo?

Sì, ha senso se resta leggero e operativo.

Non bisogna creare 12 agenti veri subito. Bisogna creare prima 3 agenti/ruoli prioritari per la TV:

| Priorità | Agent | Perché ora |
|---|---|---|
| 1 | Venue TV UX Agent | decide cosa deve essere la TV reale |
| 2 | Brand/Copy Agent | allinea package, slogan e tono |
| 3 | QA / Pilot Safety Agent | impedisce di portare una TV fragile al pilot |

Gli altri ruoli possono restare come reparto virtuale/metodo fino a quando non servono.

---

## Regola anti-dispersione

Gli agenti non devono diventare un nuovo modo per esplodere il progetto.

Ogni agent deve avere:

- input chiaro;
- confine;
- output atteso;
- cosa non deve fare;
- file da aggiornare;
- handoff al ruolo successivo.

---

## Prossimo step consigliato

Dopo questo source update, creare un prompt di ricerca:

```text
R013 — Venue TV / Pickup Screen / Digital Signage Best Practices Research
```

Obiettivo:

- capire come deve apparire una TV reale in un locale food/pub;
- studiare pickup screen, kitchen status board, digital menu board, QR signage, promo loop;
- estrarre regole UX pratiche per Walrus Kitchen TV;
- produrre un brief per Venue TV UX Agent.
