# 11 — DASHBOARD VALUE OS MASTER
> Dashboard gestionale Walbox orientata a valore, non solo ordini  
> Creato: 2026-06-22  
> Aggiornato: 2026-06-22 — dopo Consolidamento R007-R012 Experience OS

---

## Tesi centrale

La dashboard Walbox non deve essere solo una lista ordini.

Deve dimostrare al gestore:

> **Walbox ti ha generato ordini, incasso, interazioni, promo, punti e ritorno cliente.**

---

## Le 3 dashboard Walbox

### 1. Live Service Dashboard

Serve durante il servizio.

- Ordini in arrivo
- Stato pagamento
- Stato cucina
- Tavolo/banco/ritiro/asporto
- Codice ordine
- Note/allergeni/varianti
- Priorità e tempi
- Azioni staff

Questa è la dashboard Kitchen/operativa.

### 2. Revenue Dashboard

Serve al gestore per capire il valore economico.

- Incasso generato oggi da Walbox
- Numero ordini
- Valore medio ordine
- Prodotti top
- Combo top
- Pagamenti app vs banco
- Ordini per fascia oraria
- Promo che hanno convertito
- Export giornaliero

Questa è la dashboard che vende Walbox.

### 3. Experience / Loyalty Dashboard

Serve a capire coinvolgimento e ritorno.

- Clienti/nickname attivi
- Punti generati
- Premi riscattati
- Tavoli più attivi
- Jukebox request
- Mood/dediche
- Quiz/serate
- Promo usate
- Clienti/tavoli di ritorno

Questa è la dashboard che differenzia Walbox.

---

## KPI minimi V1

| KPI | Perché conta |
|---|---|
| Ordini Walbox oggi | Base operativa |
| Incasso stimato/generato | Prova valore immediata |
| Valore medio ordine | Misura upsell/scontrino |
| Prodotti più ordinati | Decisioni menu |
| Ordini per stato | Controllo servizio |
| Pagati / da pagare | Controllo pagamento |
| Cancellati | Problemi operativi |

---

## KPI V1.5

| KPI | Perché conta |
|---|---|
| Incasso pagamento app | Misura riduzione coda e adoption |
| Promo usate | Conversione commerciale |
| Punti loyalty generati | Engagement |
| Clienti/nickname attivi | Adozione Experience OS |
| Tavoli più attivi | Gamification |
| Top combo | Upsell |
| Fasce orarie forti | Decisione promo/staff |

---

## KPI V2

| KPI | Perché conta |
|---|---|
| Ritorno clienti | Fedeltà |
| Redemption premi | Efficacia loyalty |
| Conversione campagne | Marketing reale |
| Serate/eventi confrontate | Capire cosa funziona |
| Revenue per tavolo | Valore gruppi |
| Engagement → ordine | Legare esperienza e vendite |

---

## Oggetti dati chiave

```text
Venue
Menu item
Order
Payment
Customer session
Nickname/customer profile light
Loyalty transaction
Promo
Reward
Table/zone
Staff action
Event/night
TV/live interaction
```

---

## Regola fondamentale

Ogni dato deve poter rispondere a una domanda del gestore.

| Dato | Domanda |
|---|---|
| Ordini | Quanto ha lavorato Walbox oggi? |
| Incasso | Quanti soldi mi ha generato? |
| Promo | Quale offerta funziona? |
| Punti | I clienti stanno tornando/interagendo? |
| Tavoli | Quali gruppi stanno spendendo/partecipando? |
| Prodotti | Cosa devo spingere o togliere? |
| Pagamenti | Quanta fila ho evitato? |

---

## Differenza da Cassa/POS

La cassa fiscale risponde a:

> “Quanto ho fiscalizzato?”

Walbox Dashboard Value risponde a:

> “Cosa ha generato clienti, ordini, promo, engagement e ritorno?”

Le due verità devono convivere. In V1/V1.5 non devono coincidere perfettamente; in V3 si integrano.

---

## Schermate target future

### Home gestore

- Oggi Walbox ha generato: €X
- Ordini: N
- Valore medio: €Y
- Promo usate: Z
- Punti generati: P
- Top prodotto: prodotto A
- Tavolo on fire: tavolo 7

### Report serata

- Timeline ordini
- Picchi fascia oraria
- Top prodotti
- Pagamenti app/banco
- Cancellazioni
- Promo performance
- Loyalty activity

### Promo dashboard

- Promo attive
- Utilizzi
- Incasso collegato
- Prodotti collegati
- Punti bonus dati

### Loyalty dashboard

- Punti generati
- Premi riscattati
- Clienti attivi
- Classifica tavoli/clienti
- Ritorni

---

## Messaggio commerciale

> “Non ti faccio solo vedere gli ordini. Ti faccio vedere quanto Walbox ti ha fatto vendere, quali promo funzionano, quali clienti partecipano e dove puoi guadagnare di più.”

---

## Priorità prodotto

1. Report giornaliero base.
2. Incasso generato da Walbox.
3. Prodotti top.
4. Stato pagamenti.
5. Promo/loyalty base.
6. Report serata.
7. Dashboard eventi/experience.
8. Export/integrazione cassa.


---

## Aggiornamento dopo Ricerca 005 — Payment Bridge Value Layer

Payment Bridge rende la Dashboard Value OS più concreta: non basta mostrare ordini, bisogna mostrare **pagamenti confermati, provider, pending, failed e riconciliazione cassa**.

### KPI Payment Bridge V1.5

| KPI | Perché conta |
|---|---|
| Incasso pagamento app oggi | Misura valore economico generato da Walbox |
| Ordini pagati online | Misura adoption pagamento app |
| Ordini `payment_pending` | Evita caos staff/cucina |
| Ordini `failed` / `cancelled` | Misura friction pagamento |
| Breakdown provider | Satispay vs SumUp vs banco |
| Totale da battere in cassa | Rassicura gestione fiscale manuale |
| Documenti segnati come battuti | Controllo operativo staff/gestore |
| Punti loyalty confermati | Solo su ordini `paid` |

### KPI Payment Bridge V2

| KPI | Perché conta |
|---|---|
| Fee stimate per provider | Capire costo pagamento app |
| Payout previsto / ricevuto | Riconciliazione più seria |
| Refund / cancel | Controllo operativo e loyalty reversal |
| Conversione checkout | Capire abbandoni pagamento |
| Tempo medio conferma pagamento | Misura fluidità UX |
| Pagamento app vs banco per fascia oraria | Capire quando riduce la coda |

### Nuova sezione dashboard: Payment & Cassa

La dashboard gestore deve includere:

```text
Pagato da Walbox oggi: €X
Satispay: €A / N ordini
SumUp: €B / N ordini
Banco: €C / N ordini
Pending: N
Falliti: N
Da battere in cassa: €Y
Documenti segnati come battuti: N / totale pagati app
```

### Regola dati

Un ordine può generare KPI revenue/loyalty solo se:

```text
payment_status === paid
```

Gli ordini pending possono apparire nella dashboard live, ma non devono essere contati come incasso definitivo né generare punti definitivi.

### Differenza da cassa/POS dopo R005

La cassa fiscale risponde a:

> “Quanto ho fiscalizzato?”

Walbox Payment Dashboard risponde a:

> “Quanto valore è passato da Walbox, con quale provider, quali ordini sono confermati e cosa devo ancora battere/verificare in cassa?”

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

## Aggiornamento dopo Ricerca 006 — Loyalty / Promo Dashboard

La Dashboard Value OS deve mostrare non solo incasso e ordini, ma anche se Walbox sta creando ritorno cliente.

### KPI Loyalty V1.5

| KPI | Perché conta |
|---|---|
| Punti generati oggi | Misura engagement post-payment |
| Punti pending vs confirmed | Evita dati falsi |
| Reward sbloccati | Misura desiderabilità premi |
| Reward riscattati | Misura costo/uso loyalty |
| Promo attive | Controllo commerciale |
| Promo usate | Misura adoption |
| Promo conversion rate | Capire se funziona |
| Revenue influenzata da promo | Collegare promo a soldi |
| Clienti/nickname attivi | Adozione Experience OS |
| Returning nickname/customer light | Segnale ritorno |
| Top reward | Capire premi efficaci |
| Top prodotti da promo | Capire cosa spingere |
| Tavolo on fire | Misura gruppi più attivi |

### Home gestore post-R006

```text
Oggi Walbox ha generato:
- €X pagati / confermati
- N ordini
- Y punti loyalty
- Z promo usate
- W reward riscattati
- Tavolo on fire: Tavolo 7
- Promo migliore: Happy QR Hour
- Top prodotto promo: Panino + birra
```

### Promo dashboard V1.5

- promo attive;
- fascia oraria;
- utilizzi;
- ordini collegati;
- incasso collegato;
- punti bonus dati;
- costo reward stimato;
- stato: attiva / pausa / scaduta.

### Loyalty dashboard V1.5

- punti totali generati;
- punti confermati;
- punti pending;
- reward sbloccati;
- reward riscattati;
- clienti/nickname attivi;
- returning light;
- tavoli più attivi;
- export serata.

### Messaggio commerciale post-R006

> “Non ti mostro solo quanti ordini hai ricevuto. Ti mostro quali promo fanno vendere, quanti punti hai generato, quali premi vengono usati e quali clienti/tavoli stanno tornando.”

---

## Consolidamento R007/R012 — Dashboard Value OS come prova dell'Experience OS

Le ricerche R007-R012 confermano che la Dashboard Value OS non deve essere una BI generica. Deve dimostrare al gestore che Experience, ordini, pagamento, loyalty, TV e retention generano valore.

### Formula dashboard consolidata

```text
Dashboard Value OS = ordini + paid revenue + promo + loyalty + TV engagement + ritorno cliente
```

La dashboard deve rispondere a tre domande:

1. **Walbox mi ha fatto vendere?**
2. **Walbox mi ha fatto lavorare meglio?**
3. **Walbox ha fatto partecipare/tornare i clienti?**

### R008 — Dashboard value-first

La prima schermata gestore deve essere una card di valore, non un insieme di grafici.

Esempio Home gestore V1.5:

```text
Oggi Walbox ha generato:
- €842 incasso confermato
- 73 ordini
- €11,53 valore medio
- 19 nickname attivi
- 312 punti generati
- 14 promo usate
- Tavolo on fire: Tavolo 6
- Top prodotto: Panino Pulled Pork
```

Sotto, massimo 3 insight decisionali:

```text
1. Happy QR Hour ha portato 8 ordini in fascia lenta.
2. Birra + panino genera ticket medio più alto.
3. 6 ordini pagati online sono ancora da battere in cassa.
```

### Dashboard principali consolidate

| Dashboard | Serve a | Fase |
|---|---|---|
| Live Service Dashboard | gestire servizio, ordini, cucina, pagamenti | V1 |
| Revenue Dashboard | capire incasso, prodotti, ticket medio, fasce | V1/V1.5 |
| Payment & Cassa Bridge | provider, paid/pending/failed, da battere in cassa | V1.5 |
| Promo / Loyalty Dashboard | promo, punti, reward, costo e conversione | V1.5 |
| Experience / TV Dashboard | live moments, tavoli, mood, dediche, jukebox | V1.5/V2 |
| Mission/Event Dashboard | missioni, quiz, team, revenue evento | V2 |
| Retention Dashboard | returning light, save progress, reward recovery | V1.5/V2 |
| CRM/Campaign Dashboard | opt-in, reactivation, LTV, campaign ROI | V3 |

### KPI Experience / Live Screen

| KPI | Fase | Domanda a cui risponde |
|---|---|---|
| QR scans da TV | V1.5 | La TV porta azione? |
| Live moments shown | V1.5 | La serata è viva? |
| Tavoli attivi | V1.5 | I gruppi partecipano? |
| Mood votes | V1.5 | Il pubblico interagisce? |
| Dediche approvate/rifiutate | V1.5 | Quanto contenuto passa da moderazione? |
| Jukebox requests | V1.5/V2 | La musica crea engagement? |
| Reward moments | V1.5/V2 | La loyalty è visibile? |
| Safe mode activations | V1.5 | Ci sono rischi operativi? |
| Engagement → ordine | V2 | L'interazione genera consumo? |
| Engagement → paid revenue | V2 | L'interazione genera valore economico? |

### KPI Mission/Event

| KPI | Fase |
|---|---|
| missioni attivate | V1.5 |
| missioni completate | V1.5/V2 |
| tavoli/team attivi | V1.5/V2 |
| ordini legati a missione | V1.5/V2 |
| paid revenue legata a missione | V2 |
| reward sbloccati/riscattati | V1.5/V2 |
| team iscritti a quiz | V2 |
| round completati | V2 |
| drop-off tra round | V2 |
| evento vs serata normale | V2 |

### KPI Identity / Retention

| KPI | Fase | Perché conta |
|---|---|---|
| guest sessions | V1 | adozione base |
| nickname attivi | V1.5 | partecipazione light |
| save progress rate | V1.5 | volontà di tornare |
| customer profile light creati | V1.5/V2 | identità senza CRM pesante |
| returning session/nickname | V1.5/V2 | ritorno light |
| reward recovery rate | V1.5/V2 | punti/reward non persi |
| repeat paid revenue | V2 | valore del ritorno |
| wallet pass salvati | V2 | retention app-less |
| lapsed customers | V3 | riattivazione |
| marketing opt-in rate | V3 | base CRM legittima |

### Report Serata consolidato

Struttura consigliata:

```text
Report Serata — [giorno/data]

1. Quanto ha generato Walbox
2. Cosa ha venduto di più
3. Quale promo ha funzionato
4. Quali tavoli/clienti hanno partecipato
5. Cosa è successo sul live screen
6. Quali punti/reward sono stati generati
7. Cosa controllare in cassa
8. Cosa provare nella prossima serata
```

### Regola anti-vanity metrics

Un KPI entra nella dashboard solo se aiuta il gestore a decidere.

Esempi utili:

- promo usata → ordini paid → incasso collegato;
- missione completata → reward → costo stimato;
- tavolo attivo → ordini → ticket medio;
- TV promo shown → QR scans → ordini.

Esempi da evitare in V1/V1.5:

- impression TV non collegate a QR/ordine;
- like generici;
- “clienti iscritti” senza ritorno;
- profilo cliente dettagliato senza consenso;
- revenue incrementale non dimostrabile.

### Dashboard Walrus consigliata

```text
STASERA WALBOX HA ACCESO IL WALRUS

€1.240 incasso confermato
91 ordini
€13,62 ticket medio
38 nickname attivi
22 richieste jukebox
14 dediche approvate
Tavolo on fire: Tavolo 7
Combo top: Panino + Krombacher
Promo top: Happy QR Hour
```

### Dashboard bar/gelateria consigliata

```text
Oggi Walbox ha generato:
- 64 ordini
- gusto/prodotto top
- 18 progress tessera aggiornati
- 9 reward sbloccati
- fascia migliore: 16:00-18:00
- promo fascia lenta: +X ordini
```

