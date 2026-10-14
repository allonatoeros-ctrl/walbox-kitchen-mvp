# 09 — VENUE EXPERIENCE OS MASTER
> Nuovo pilastro strategico Walbox: customer experience, interazione, gamification, loyalty e live venue layer  
> Creato: 2026-06-22  
> Aggiornato: 2026-06-22 — dopo Consolidamento R007-R012 Experience OS

---

## Tesi centrale

Il QR code non è il prodotto.

Il QR code è l'ingresso nel mondo digitale del locale.

Walbox nasce per trasformare un bar, pub, gelateria o piccolo locale in uno spazio digitale vivo, riconoscibile e partecipativo.

> **Walbox Venue Experience OS = customer experience interattiva + ordine + pagamento + loyalty + live screen + dashboard valore.**

---

## Origine dell'idea

Walbox nasce dal Jukebox Walrus:

- QR al tavolo;
- nickname;
- richiesta canzone;
- dedica;
- mood/reaction;
- dashboard staff;
- Live TV / Poster TV;
- classifiche;
- momenti social;
- atmosfera da locale.

Questa origine non va persa. Kitchen e ordini sono cresciuti dopo, ma l'anima del prodotto è l'interazione.

---

## Problema che Walbox risolve

Nei piccoli locali la customer experience dipende troppo da persone, caos, umore, staff, paga bassa, servizio pieno e capacità del gestore.

Walbox non sostituisce l'umano. Lo amplifica.

Walbox rende replicabile una parte dell'esperienza:

- il cliente entra nel mondo del locale;
- partecipa;
- ordina;
- paga;
- riceve status;
- accumula punti;
- vede la serata sullo schermo;
- torna perché sente appartenenza.

---

## Feature core Experience OS

### V1 / V1.5

- Nickname cliente
- Dedica / messaggio breve
- Mood serata
- Jukebox/request song moderata
- TV/live screen base
- Promo manuali
- Punti base per ordine/pagamento
- Tavolo on fire base
- Badge/leaderboard semplice

### V2

- Quiz night
- Serate evento configurabili
- Campaign engine
- Promo programmate
- Premi riscattabili
- Segmenti cliente light
- Social wall moderato
- Missioni/achievement
- Classifiche tavoli/clienti

### V3+

- Personalizzazione AI promo
- Dynamic upsell basato su ordine
- Venue CRM evoluto
- Multi-locale / community
- Integrazione social/content

---

## Regole prodotto

1. Ogni interazione deve produrre valore visibile: punti, status, TV, dashboard.
2. Ogni promo deve essere misurabile.
3. Ogni ordine deve poter alimentare loyalty.
4. La TV non è decorazione: è feedback sociale live.
5. Il tono deve sembrare del locale, non di una piattaforma SaaS generica.
6. Il cliente non deve “usare software”: deve entrare nella serata.

---

## Meccaniche Walrus esempio

| Meccanica | Descrizione | Valore per locale |
|---|---|---|
| Tavolo on fire | Tavolo con più ordini/interazioni/punti | Spinge gruppi a ordinare/partecipare |
| Jukebox con dedica | Cliente richiede canzone e dedica | Aumenta presenza emotiva e TV content |
| Happy QR hour | Promo solo da QR in fascia oraria | Porta ordini digitali e misura conversione |
| Panino + birra bonus | Combo con punti extra | Aumenta scontrino medio |
| Quiz night | Tavoli/team competono | Serata evento replicabile |
| Mood serata | Clienti votano mood | Content live + engagement |

---

## Cosa copiare dai competitor Experience/Loyalty

Da loyalty app:
- punti per acquisto;
- premi semplici;
- livelli;
- campagne;
- ritorno cliente.

Da pub quiz/event platforms:
- team/tavoli;
- classifica live;
- premio finale;
- ritmo serata.

Da social wall/live screen:
- contenuti moderati;
- visual grande;
- feedback immediato;
- momenti condivisi.

Da QR/order competitor:
- flusso ordine/pagamento semplice;
- status chiaro;
- ticket/codice;
- report.

---

## Differenza Walbox

Walbox non è una loyalty card e non è un gestionale.

È il livello che collega:

```text
cliente → interazione → ordine → pagamento → punti → TV → dashboard → ritorno
```

---

## KPI Experience OS

- Interazioni per serata
- Clienti/nickname attivi
- Tavoli partecipanti
- Punti generati
- Promo usate
- Premi riscattati
- Ordini influenzati da promo
- Valore medio ordine da clienti attivi
- Richieste jukebox/mood/dediche
- Ritorno clienti identificabili

---

## File collegati

- `06_WALBOX_STRATEGY_MASTER.md`
- `08_COMPETITIVE_STRATEGY_MASTER.md`
- `11_DASHBOARD_VALUE_OS_MASTER.md`
- `03_FEATURE_MATRIX_MASTER.md`
- `05_FIELD_RESEARCH_MASTER.md`


---

## Aggiornamento dopo Ricerca 005 — Payment Bridge come trigger Experience

Payment Bridge non serve solo a incassare. Serve a trasformare il pagamento confermato in esperienza misurabile.

### Regola Experience OS

```text
ordine creato ≠ valore confermato
pagamento confermato = valore, punti, promo, dashboard
```

### Implicazioni

- I punti loyalty vengono confermati solo dopo `paid`.
- Le promo “spendi X / combo / bonus” si chiudono solo dopo pagamento confermato.
- La TV/live screen può mostrare momenti social, ma non deve mostrare incassi o reward non confermati.
- Dashboard Value OS deve distinguere interazione, ordine e pagamento.

### Meccaniche rese possibili da Payment Bridge

| Meccanica | Trigger |
|---|---|
| Punti per euro speso | pagamento `paid` |
| Combo bonus | pagamento `paid` con prodotti target |
| Tavolo on fire | somma ordini/pagamenti confermati + interazioni |
| Happy QR hour | pagamento `paid` in fascia oraria |
| Premio riscattabile | saldo punti confermati |
| Report serata | pagamenti confermati + ordini kitchen |

### Nuova domanda per Experience OS

> Ogni interazione porta a un dato, ogni ordine porta a un pagamento, ogni pagamento confermato deve poter generare loyalty e dashboard valore.

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

## Aggiornamento dopo Ricerca 006 — Loyalty come Experience Layer

La loyalty Walbox non deve sembrare una tessera punti separata. Deve sembrare una conseguenza naturale della serata.

### Nuova catena Experience

```text
cliente scansiona → nickname → ordine → pagamento paid → punti → badge/reward → TV/live moment → ritorno
```

### Meccaniche Experience rese prioritarie da R006

| Meccanica | Fase | Perché conta |
|---|---|---|
| Punti post-`paid` | V1.5 | Lega valore reale a engagement |
| Stamp card | V1.5 | Semplice per bar/gelaterie |
| Promo QR | V1.5 | Conversione misurabile |
| Tavolo on fire | V1.5/V2 | Meccanica unica Walbox |
| Jukebox booster | V1.5/V2 | Recupera origine Walrus |
| Reward emozionali | V2 | Non solo sconti, ma appartenenza |
| Leaderboard tavoli | V2 | Serata partecipativa |
| Missioni/challenge | V2 | Trasforma ordine in gioco leggero |

### Regola TV/live screen

La TV può mostrare:

- tavolo on fire;
- badge serata;
- punti aggregati del tavolo;
- promo attiva;
- missione della serata;
- reward sbloccati in modo anonimo o nickname-consensual.

La TV non deve mostrare:

- incassi;
- dati personali;
- telefono/email;
- storico cliente;
- reward sensibili.

### Differenza Walbox post-R006

Walbox non dice: “hai una fidelity card”.

Walbox dice:

> “Ogni volta che il cliente partecipa, ordina e paga, il locale diventa più vivo e il gestore vede valore misurabile.”

---

## Consolidamento Experience OS — R007/R012

Le ricerche R007-R012 consolidano l'Experience OS in un sistema coerente, non in una lista di feature isolate.

### Catena Experience consolidata

```text
cliente scansiona → nickname/sessione → tavolo/team → interazione → ordine → pagamento paid → punti/reward → TV live moment → dashboard valore → ritorno
```

### R007 — Live Pulse Engine

Walbox non deve partire da social wall aperto o quiz completo. Deve partire da un **Live Pulse Engine**: un motore di momenti live sicuri e controllati.

La TV può mostrare:

- tavolo on fire;
- promo attiva;
- missione della serata;
- mood poll;
- dediche approvate;
- richiesta canzone approvata;
- reward sbloccato in forma anonima o consensual;
- classifica tavoli aggregata;
- QR per partecipare.

La TV non deve mostrare:

- incassi;
- telefono/email;
- nome reale;
- storico cliente;
- importo speso dal tavolo;
- contenuti liberi non moderati;
- dati sensibili.

### R009 — Live Venue Channel

La TV Walbox deve essere progettata come **Live Venue Channel**, non come menu board o dashboard.

Modello consigliato:

```text
Default Loop + Live Interruptions
```

Significa:

- normalmente gira un loop pulito con brand, QR, promo e mood;
- quando succede qualcosa di rilevante entra un live moment;
- dopo pochi secondi la TV torna al loop.

Layer TV:

| Layer | Funzione |
|---|---|
| Brand layer | Identità locale, serata, atmosfera |
| Action layer | QR, promo, ordine, missione |
| Live layer | tavoli, mood, punti, reward, dediche, jukebox request |

### R010 — Mission Night Light prima di Quiz Night

Walbox deve vendere prima **Mission Night Light**, poi Quiz Night completo.

Mission Night Light V1.5:

- missione attiva della serata;
- tavolo/team score;
- punti legati a interazione + ordine + pagamento `paid`;
- reward controllato;
- TV live moment;
- dashboard missione.

Quiz Night V2:

- team registration;
- round quiz;
- timer;
- scoring;
- leaderboard TV;
- promo tra round;
- premio finale;
- report evento.

### R011 — Progressive Identity Ladder

Walbox deve essere app-less e account-less in V1.5.

L'identità deve crescere solo quando crea valore immediato:

| Livello | Identità | Fase |
|---|---|---|
| 0 | Guest session QR | V1 |
| 1 | Nickname / team / tavolo | V1/V1.5 |
| 2 | Loyalty session light | V1.5 |
| 3 | Save progress opzionale con telefono/email | V1.5 |
| 4 | Customer profile light | V2 |
| 5 | Wallet pass | V2 |
| 6 | CRM / marketing opt-in | V3 |

Regola UX:

```text
prima valore → poi richiesta dati
```

Non dire “crea account”. Dire:

> “Hai guadagnato punti. Vuoi salvarli per la prossima volta?”

### R012 — Return Loop Engine

Walbox deve vendere ritorno cliente senza vendere CRM.

Loop prioritari:

| Loop | Fase | Esempio |
|---|---|---|
| Immediate Reward Loop | V1.5 | “Hai guadagnato 18 punti” |
| Stamp Progress Loop | V1.5 | 10 caffè / 6 gelati / 5 colazioni |
| Manca Poco Loop | V1.5 | “Ti manca 1 acquisto per il premio” |
| Live Status Loop | V1.5/V2 | Tavolo on fire, badge, TV moment |
| Mission/Event Return Loop | V2 | Missione o quiz ricorrente |
| Save Progress Loop | V1.5/V2 | Salva punti via telefono/email/wallet |
| Community Loop | V2/V3 | prossima serata, gruppo, evento |

### Feature Experience OS consolidate per fase

| Fase | Feature Experience |
|---|---|
| **V1** | nickname, dedica/messaggio, TV base, status ordine, QR brandizzato |
| **V1.5** | Live Pulse, tavolo on fire, mood poll, promo live, reward moment, Mission Night Light, punti/stamp progress, save progress |
| **V2** | Quiz Night, event mode, social wall moderato, leaderboard tavoli, wallet pass, mission calendar, team ricorrenti |
| **V3** | CRM opt-in, community loops, reactivation, tier/VIP, AI promo, multi-locale |

### Regole Experience OS post-consolidamento

1. Ogni meccanica deve essere comprensibile in pochi secondi.
2. Ogni interazione deve avere output: punti, status, TV, reward o dashboard.
3. Ogni metrica economica deve dipendere da ordine o pagamento confermato.
4. Ogni contenuto pubblico deve essere sicuro o moderato.
5. Ogni dato personale deve essere progressivo e opzionale.
6. Ogni feature deve vendere valore al gestore, non solo divertimento al cliente.

### Meccaniche Walrus consolidate

| Meccanica | Fase | Valore |
|---|---|---|
| Tavolo on fire | V1.5 | gruppo, competizione leggera, ordini |
| Jukebox booster | V1.5/V2 | recupera origine Walbox, atmosfera |
| Panino + birra mission | V1.5 | upsell e scontrino medio |
| Dedica approvata TV | V1.5 | appartenenza e contenuto emotivo |
| Mission Night | V1.5 | serata giocabile senza host completo |
| Quiz Night | V2 | evento ricorrente vendibile |
| Regular badge | V2 | ritorno e status |

### Meccaniche bar/gelateria consolidate

| Meccanica | Fase | Valore |
|---|---|---|
| Stamp card caffè/gelato | V1.5 | semplicità commerciale |
| Topping/upgrade reward | V1.5 | premio sostenibile |
| Doppio punto fascia lenta | V1.5 | riempire buchi orari |
| Flavor battle / prodotto del giorno | V1.5/V2 | engagement leggero |
| Wallet pass | V2 | ritorno senza app |
| Birthday reward | V3 | solo con consenso |

---

## Aggiornamento 2026-06-28 — Stato TV dopo Checkpoint Kitchen V1.1

### Chiarimento necessario

La TV è centrale nel Venue Experience OS, ma **non risulta validata dal checkpoint Kitchen V1.1**.

Il checkpoint V1.1 valida il flusso operativo Kitchen. Non certifica:

- route TV effettiva;
- componente TV attualmente usato;
- collegamento a ordini Kitchen;
- datasource TV: Supabase, localStorage, mock o statico;
- stato produzione;
- leggibilità su schermo grande;
- safe mode;
- assenza dati sensibili.

### Decisione Experience OS

> La TV non viene rimossa dalla roadmap. Viene separata in un audit dedicato prima del pilot.

### TV Route & Data Audit — checklist

Prima di usare la TV in pilot, verificare:

| Punto | Domanda |
|---|---|
| Route | Quale URL apre la TV oggi? |
| Component | Quale componente React viene renderizzato? |
| Data source | La TV legge ordini reali, mock, localStorage o Supabase? |
| Realtime | Cambia quando arriva un ordine? |
| Production | Funziona su Vercel/produzione? |
| Visual | Si legge da 3-5 metri? |
| QR | Il QR è persistente e leggibile? |
| Privacy | Mostra dati sensibili o ID tecnici? |
| Safety | Esiste una modalità safe/poster? |
| Pilot readiness | È usabile durante servizio reale? |

### Modalità consentite nel primo pilot

| Modalità | Quando usarla |
|---|---|
| Kitchen-only | TV rotta/confusa/non pronta |
| Safe TV / Poster Mode | TV bella e stabile ma non live |
| Safe Live TV | TV collegata a dati reali e priva di rischi privacy |
| Live Pulse completo | Solo V1.5 dopo scope dedicato |

### Regole TV per pilot

Nel primo pilot la TV può mostrare:

- brand locale;
- QR;
- promo semplice;
- call to action ordine;
- messaggio serata;
- eventuale stato aggregato non sensibile.

Nel primo pilot la TV non deve mostrare:

- incassi;
- telefono/email;
- nome reale;
- storico cliente;
- importo speso dal tavolo;
- contenuti liberi non moderati;
- ID tecnici o debug data.

### Nota prodotto

La TV resta il ponte tra Kitchen V1.1 e Venue Experience OS. Ma il ponte va verificato prima di usarlo in campo.

---

## Addendum 2026-06-28 — Walrus Kitchen Brand Direction per Experience OS

### Decisione

Per Walrus Kitchen, la direzione Experience OS deve spostarsi da “pub grunge/provocatorio” a:

```text
food brand ironico / panini ignoranti / fame educata / street premium
```

### Implicazione TV

La TV deve sembrare il canale digitale ufficiale del food brand Walrus Kitchen.

Deve mostrare:

- brand nero/giallo;
- QR/CTA leggibile;
- ordini pronti e in cottura;
- promo food-oriented;
- microcopy ironico ma non volgare;
- eventuali momenti live sicuri.

Non deve diventare:

- poster pub generico;
- dashboard gestionale;
- social wall non moderato;
- schermata profanity-based;
- KDS tecnico pieno di microdati.

### Copy tone aggiornato

Preferire:

```text
PANINI IGNORANTI
FAME EDUCATA
FAME EDUCATA, MORSI IGNORANTI
ORDINA DAL QR. NOI ACCENDIAMO LA FAME.
```

Evitare come asse principale:

```text
Always That Fucking Walrus
```

### Nota metodo

Questa decisione conferma che Walbox Venue Experience OS deve avere un Brand/Copy layer separato dal solo frontend: la voce del locale è parte del prodotto.

