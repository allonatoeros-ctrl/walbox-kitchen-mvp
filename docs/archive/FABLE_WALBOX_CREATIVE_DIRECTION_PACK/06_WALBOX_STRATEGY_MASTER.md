# 06 — WALBOX STRATEGY MASTER
> Strategia di prodotto Walbox Kitchen per il mercato Ho.Re.Ca. italiano  
> Aggiornato: 2026-06-22 — dopo Consolidamento R007-R012 Experience OS

---

## Visione

---

## Decisione strategica nuova — Walbox Venue OS

Walbox non va più definito solo come “sistema QR/order/kitchen”. Questa definizione è troppo stretta e rischia di schiacciare il prodotto nel confronto diretto con Qromo, Tavolinux, Cassa in Cloud e Tilby.

La definizione strategica aggiornata è:

> **Walbox è la mini-app esperienziale del locale: fa interagire, ordinare, pagare, fidelizzare e mostra al gestore quanto valore ha generato.**

### Nuova struttura prodotto

| Pilastro | Promessa | Differenza competitiva |
|---|---|---|
| **Experience OS** | Il locale diventa interattivo, vivo, giocabile | Nessun competitor POS ha questo come cuore |
| **Order / Kitchen OS** | Il cliente ordina e lo staff lavora meglio | Copia flussi buoni da Qromo/Cassa/Tilby/Tavolinux |
| **Payment Bridge** | Il cliente paga dall'app e riduce fila/coda | Integrazione provider, non fiscalità proprietaria iniziale |
| **Dashboard Value OS** | Il gestore vede soldi, promo, loyalty e clienti attivi | Prova commerciale del valore generato |

### Nuovo posizionamento commerciale

> “Non ti vendo solo un QR menu. Ti do la mini-app del tuo locale: i clienti ordinano, pagano, partecipano, accumulano punti e tu vedi quanto Walbox ti ha generato.”

### Confine pagamento/fiscale

Walbox può integrare pagamenti dentro l'app tramite provider esterni. L'obiettivo è che il cliente paghi da Walbox e che i soldi arrivino sul profilo business del locale. Walbox riceve lo stato pagamento e aggiorna ordine, kitchen, loyalty e dashboard.

La fiscalità resta inizialmente fuori: il locale batte scontrino sulla sua cassa. In V2/V3 Walbox può integrare POS/casse selezionate o partner fiscali.

### Dashboard come prodotto vendibile

La dashboard non deve mostrare solo ordini. Deve mostrare valore:

- ordini generati da Walbox;
- incasso generato da Walbox;
- valore medio ordine;
- prodotti top;
- promo usate;
- punti loyalty generati;
- clienti/nickname attivi;
- tavoli più forti;
- andamento serate/eventi.

### Nuova roadmap sintetica

| Fase | Nome | Obiettivo |
|---|---|---|
| V1 | Kitchen + QR Order | Ordini, KDS, pagamento al banco, report base |
| V1.5 | Payment + Loyalty Base | Pagamento app, punti, promo semplici, dashboard valore base |
| V2 | Venue OS | Quiz, live screen evoluto, campaign engine, report avanzati, export/stampa |
| V3 | Integration Layer | Integrazione 1-2 casse/POS, riconciliazione, partner fiscali |
| V2000 | Gestionale completo | Solo se mercato/team/partner lo giustificano |

### Implicazione

Kitchen resta prioritaria, ma non è più un modulo isolato. Ogni ordine deve alimentare pagamento, loyalty, dashboard e valore commerciale.


**Walbox Kitchen diventa il sistema di ordini QR preferito dai piccoli locali italiani** grazie a un'esperienza di onboarding rapida, un'identità visiva superiore ai competitor, e un modello di pricing accessibile.

Non vogliamo essere il più completo dal giorno uno.
Vogliamo essere **il più facile da adottare, più bello da mostrare ai clienti e abbastanza operativo da reggere una serata reale.**

Dopo Cassa in Cloud, la visione si chiarisce:

> Walbox non deve sostituire subito la cassa fiscale. Deve diventare il miglior layer QR/order/kitchen da mettere sopra o accanto ai sistemi esistenti del locale.

---

## Posizionamento

| Asse | Walbox Kitchen | Competitor |
|---|---|---|
| Semplicità | Alta | Media (Qromo) / Bassa (gestionali completi) |
| Estetica UI | Alta | Bassa/media; Qromo moderno ma più SaaS/template; Cassa in Cloud più POS/gestionale |
| Speed to live | Target < 30 min | Qromo promette menu rapido; Cassa in Cloud richiede setup gestionale più ampio |
| Prezzo | Accessibile e trasparente | Qromo da Free a €99+/mese; Cassa in Cloud con piani/preventivo; gestionali variabili |
| Personalizzazione brand | Alta | Limitata/media |
| Motore gestionale | Medio-basso oggi | Alto per Tavolinux/Cassa/Tilby/Qromo All-in-One |
| Fiscalità/POS | Non V1 | Forte in Cassa in Cloud/Tavolinux/Qromo POS/Tilby |
| Hardware / integrazioni | Partner/integration-ready da V1.5/V2 | Forte in Tilby/Cassa/Tavolinux/Qromo All-in-One |

---

## Clienti ideali (ICP)

### ICP primario

- Pub / birreria artigianale, 20–80 coperti.
- Gestore o proprietario gestisce direttamente.
- Non ha un IT manager.
- Vuole sembrare moderno ma non ama la burocrazia software.
- Ha bisogno di menu/ordine/staff/cucina, non di ERP completo.
- Preferisce un flusso semplice: QR → ordine → banco/cucina → ritiro/status.
- Non vuole per forza sostituire subito la cassa esistente.

### ICP secondario

- Bar di quartiere con servizio al tavolo.
- Gelaterie con asporto + consumazione.
- Caffetterie con brunch o aperitivo.
- Piccoli locali urban/millennial.
- Locali eventi/pop-up dove QR e ticket ritiro contano più del gestionale completo.

### ICP da evitare in V1

- Ristoranti strutturati che cercano sostituzione completa della cassa.
- Catene/franchising con fiscalità, magazzino, multi-sede e integrazioni già obbligatorie.
- Locali che richiedono RT/corrispettivi/fatturazione dentro lo stesso prodotto dal primo giorno.

---

## Vantaggi competitivi reali da difendere

1. **Pipeline Figma → Design Tokens → Claude Code**: rebrand per nuovo cliente in 3-4 ore.
2. **UI curata e brandizzata**: nessun competitor visto finora sembra puntare davvero su mini-app premium del locale.
3. **Made in Italy per l'Italia**: lingua, UX, mentalità locale.
4. **Velocità di iterazione**: stack React/Vite + AI accelera feature delivery.
5. **Experience layer**: TV/live screen, status cliente, mood, visual identity.
6. **Semplicità commerciale**: vendere un sistema operativo per servizio reale, non un gestionale infinito.
7. **Compatibilità mentale con la cassa esistente**: Walbox non obbliga il locale a cambiare tutto subito.

---

## Ricerca 001 Tavolinux — implicazione strategica

Tavolinux è un competitor ad alta minaccia sul motore operativo:

- cassa/fiscale
- comande
- tavoli
- pagamenti
- hardware
- statistiche
- magazzino

Walbox non deve inseguire tutto questo in V1.
Deve battere Tavolinux dove il cliente vede il prodotto:

- QR menu
- flusso ordine
- brandizzazione
- stato ordine
- leggibilità staff/cucina
- onboarding semplice

---

## Ricerca 002 Qromo — implicazione strategica

Qromo è il competitor diretto più pericoloso sul segmento QR/order/pay moderno.
È forte su:

- menu digitale senza app
- ordini e pagamenti QR
- Paga il Conto dal tavolo
- Satispay e altri metodi pagamento
- dashboard ordini
- QR tavoli/sale
- menu multilingua, allergeni, prodotti componibili
- report vendite/visualizzazioni
- POS mobile e fiscalità digitale
- KDS nel piano All-in-One

**Decisione strategica:** Walbox non deve diventare subito un clone Qromo all-in-one. Deve diventare la scelta migliore per piccoli locali che vogliono QR/order/kitchen bello, chiaro, rapido e brandizzato.

**Conseguenza:** V1 deve sembrare vendibile, non demo. V1.5 deve chiudere i blocchi che Qromo usa in vendita: pagamento, Satispay, stampa/export, report, ruoli, notifiche.

---

## Ricerca 003 Cassa in Cloud — implicazione strategica

Cassa in Cloud è il benchmark TeamSystem sul mondo POS/cassa/gestionale fiscale Ho.Re.Ca.
È forte su:

- punto cassa e gestionale completo
- fiscalità italiana, scontrini, corrispettivi e fatturazione
- pagamenti digitali/TS Pay, Satispay, Apple Pay, PayPal, carte
- pagamento al tavolo via QR
- gestione tavoli, comande e sala/cucina
- Kitchen Monitor e stampanti
- menu management con varianti e prodotti componibili
- magazzino
- report avanzati
- operatori, turni, permessi
- hardware ed ecosistema TeamSystem

**Decisione strategica:** Walbox non deve competere frontalmente con Cassa in Cloud in V1. Deve vendersi come layer QR/order/kitchen leggero e brandizzato che può convivere con la cassa esistente.

**Conseguenza:** V1 deve chiudere operatività percepita, non fiscalità: varianti, QR tavolo/zona, pagamento al banco chiaro, report giornaliero, receipt non fiscale, KDS leggibile, onboarding. V1.5 deve aggiungere pagamenti, Satispay, stampa/export e ruoli. POS/fiscale restano V2/V3 o partnership.

---

## Ricerca 004 Tilby — implicazione strategica

Tilby è il benchmark più utile per capire il modello POS cloud moderno: multidispositivo, hardware certificato, pagamenti, SumUp, Satispay, Alvòlo self-order, Klancy KDS, magazzino, analytics, API e integrazioni.

È forte su:

- POS/cassa cloud su PC, Mac, tablet e smartphone
- fiscalità italiana, documenti commerciali, scontrini digitali e fattura elettronica
- conti separati e pagamenti
- comande da tablet/smartphone con varianti e sequenza cucina
- mappe tavoli e sale
- Alvòlo per menu digitale, QR tavolo e self-order
- Klancy per Kitchen Display
- SumUp e altri partner pagamento/hardware
- hardware certificato: tablet, computer, stampanti fiscali RT, stampanti non fiscali, POS, cassetti automatici, bilance
- magazzino, food cost, analytics, export CSV/Excel/Google Fogli
- API e molte integrazioni partner

**Decisione strategica:** Tilby non deve spingere Walbox a costruire un POS proprietario. Deve spingere Walbox a diventare cassa-agnostic ma credibile: ordini, QR, cucina, report, stampa/export e pagamenti devono convivere con il sistema cassa esistente.

**Conseguenza:** V1 resta layer QR/order/kitchen. V1.5 deve chiudere pagamenti, Satispay da valutare, stampa/export, report e ruoli. V2 deve prevedere integrazioni partner e hardware consigliato. V3 può valutare fiscalità/POS solo tramite partner o se il mercato lo richiede.

---

## Rischi principali

| Rischio | Mitigazione |
|---|---|
| Tavolinux/gestionali vincono su completezza | Posizionare Walbox come QR/order/kitchen bello e rapido, non ERP |
| Qromo vince su pagamenti/order-pay | Inserire pagamento online e Satispay in V1.5 |
| Cassa in Cloud vince su POS/fiscale | Non competere su sostituzione cassa in V1; vendere layer sopra la cassa attuale |
| Cassa in Cloud vince su hardware/stampa | Inserire stampa/export comanda in V1.5 e partnership hardware in V2 |
| Tilby vince su POS cloud/hardware/integrations | Non competere come cassa; vendere Walbox come layer sopra la cassa e preparare integrazioni partner |
| Qromo/Cassa vincono su menu management | Aggiungere varianti, prodotti componibili, dashboard menu e QR management |
| Qromo/Cassa vincono su KDS/operatività | Rendere KDS Walbox meno ricco ma più leggibile, semplice e adatto a pub/bar |
| Il cliente non paga | Pricing accessibile + prova reale con locale pilota |
| Sistema cade durante il servizio | Fallback, cache, monitor QA, deploy stabile, procedure operative chiare |
| Walbox resta troppo demo | Feature parity plan: varianti, report, pagamento, stampa/export, ruoli |

---

## Modello di pricing ipotetico da validare

| Piano | Prezzo/mese | Limite / promessa |
|---|---:|---|
| Starter | €0 | 100 ordini/mese, 1 QR, demo reale |
| Pro | €39 | Ordini illimitati, 5 QR, KDS base, analytics base |
| Pro+ | €69 | Pagamenti integrati, Satispay se possibile, report, export/stampa, ruoli |
| Custom | Su misura | Multi-location, white label, integrazioni |

> ⚠️ Pricing da validare con ricerca di mercato e interviste. Dopo Qromo, €39 deve battere la percezione di semplicità/brand; dopo Cassa in Cloud, €39 deve anche comunicare chiaramente che Walbox non sostituisce la cassa ma migliora subito QR/order/kitchen.

---

## Metriche di successo

- Tempo onboarding nuovo cliente: target < 30 minuti
- Clienti attivi a 6 mesi: target 10 venue
- Churn mensile: target < 5%
- NPS: target > 40
- Primo ordine demo completato: < 5 minuti dal setup
- Primo menu pubblicato: < 30 minuti dal primo accesso
- Primo QR tavolo/bancone generato: < 10 minuti dal setup
- Primo report giornaliero leggibile: entro la prima serata di utilizzo
- Percentuale locali che usano Walbox senza cambiare cassa: metrica da validare sul campo

---

## Messaggio commerciale aggiornato

> "Non ti chiedo di cambiare cassa. Ti do un sistema QR/order/kitchen bello, chiaro e pronto per il servizio, che lavora sopra il tuo flusso attuale."

> "Partiamo semplice: menu, ordini, cucina, codice ritiro e stato cliente. Pagamenti, stampa e integrazioni arrivano quando ti servono davvero."

---

## Fonti competitor da tenere nel workspace

### Qromo

- https://qromo.it/
- https://qromo.it/menu-digitale/
- https://qromo.it/ordini-pagamenti/
- https://qromo.it/prezzi/
- https://qromo.it/pos/
- https://qromo-help.freshdesk.com/

### Cassa in Cloud

- https://www.teamsystem.com/horeca/cassa-in-cloud/
- https://www.teamsystem.com/horeca/cassa-in-cloud/prezzi/
- https://www.teamsystem.com/horeca/cassa-in-cloud/funzionalita/self-order-app/
- https://www.teamsystem.com/horeca/cassa-in-cloud/funzionalita/metodi-pagamenti-digitali/
- https://www.teamsystem.com/horeca/cassa-in-cloud/funzionalita/gestione-comande/
- https://www.teamsystem.com/horeca/cassa-in-cloud/funzionalita/kitchen-monitor/
- https://www.teamsystem.com/horeca/cassa-in-cloud/funzionalita/listini-menu/
- https://www.teamsystem.com/horeca/cassa-in-cloud/funzionalita/report-statistiche/

### Tilby

- https://www.tilby.com/it/home/
- https://www.tilby.com/it/settori/software-gestionale-cassa-ristorante/
- https://www.tilby.com/it/come-funziona/funzioni/postazione-cassa/
- https://www.tilby.com/it/come-funziona/integrazioni/alvolo/
- https://www.tilby.com/it/come-funziona/integrazioni/sumup-pos/
- https://www.tilby.com/it/risorse/hardware/
- https://www.tilby.com/it/come-funziona/integrazioni/klancy-kitchen-display/
- https://www.tilby.com/it/come-funziona/funzioni/magazzino/
- https://www.tilby.com/it/come-funziona/funzioni/analytics/
- https://www.tilby.com/it/come-funziona/integrazioni/
- https://support.tilby.com/hc/it/articles/18745166122909-Collegamento-all-app-Comande-di-Tilby
- https://play.google.com/store/apps/details?id=com.scloby.pos&hl=it
- https://play.google.com/store/apps/details?id=com.scloby.orders&hl=it


---

## Ricerca 005 — Decisione Payment Bridge Italia

Dopo l'analisi di Satispay Business API, SumUp Hosted Checkout, SumUp OAuth/Cloud API, Stripe Connect e Nexi XPay, la decisione strategica è:

> **Walbox non deve incassare per conto del locale in V1/V1.5. Deve orchestrare il pagamento sul provider del locale e usare lo stato pagamento per aggiornare kitchen, loyalty e dashboard valore.**

### Modello scelto: Merchant-local Payment Bridge

| Elemento | Decisione Walbox |
|---|---|
| Chi ha account provider | Il locale |
| Dove arrivano i soldi | Account business/conto del locale |
| Cosa riceve Walbox | Stato pagamento + riferimento ordine |
| Cosa aggiorna Walbox | Ordine, KDS, stato cliente, loyalty, dashboard |
| Cosa resta fuori | Documento fiscale, corrispettivi, RT, cassa |

### Provider per fase

| Fase | Provider | Strategia |
|---|---|---|
| V1.5 | Satispay Business API | Primo test vendibile per piccoli locali italiani |
| V1.5 | SumUp Hosted Checkout | Fallback carte/wallet e locali già SumUp |
| V2 | Stripe Connect | Scalabilità multi-locale e connected accounts |
| V2 | SumUp OAuth | Collegamento account per locali SumUp |
| V2/V3 | Nexi XPay | Provider italiano da attivare se richiesto o partnerizzato |

### Impatto sulla promessa commerciale

Walbox può dire:

> “Il cliente paga dall'app. I soldi arrivano sul tuo provider business. Walbox aggiorna ordine, cucina, punti e dashboard. La cassa fiscale resta la tua.”

Walbox non deve dire:

> “Sostituiamo la cassa” oppure “facciamo noi lo scontrino fiscale”.

### Impatto sulla roadmap

| Fase | Aggiornamento dopo R005 |
|---|---|
| V1 | Rafforzare pagamento al banco e stato pagamento separato |
| V1.5 | Satispay + SumUp Hosted Checkout + dashboard payment |
| V2 | Stripe Connect + SumUp OAuth + riconciliazione avanzata |
| V3 | POS/cassa integration selezionata |

### Nuovo criterio prodotto

Ogni ordine deve diventare una catena misurabile:

```text
interazione → ordine → pagamento confermato → kitchen → loyalty → dashboard valore → eventuale documento fiscale esterno
```

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

## Ricerca 006 — Decisione Loyalty / Promo Engine

Dopo l'analisi di Open Loyalty, Paytronix, Punchh, Thanx, Como, BonusQR, Stamp Me, Square Loyalty, Toast Loyalty e sistemi wallet/stamp card, la decisione strategica è:

> **Walbox deve partire con loyalty light post-payment, non con CRM pesante.**

### Modello scelto: Loyalty Light Engine

| Elemento | Decisione Walbox |
|---|---|
| Identità V1.5 | Nickname/sessione QR |
| Trigger punti | Solo pagamento `paid` |
| Modello bar/gelateria | Stamp card + punti base |
| Modello pub | Punti + tavolo on fire + reward emozionali |
| Promo | QR promo manuali e misurabili |
| Reward | Codice/QR + validazione staff |
| Dashboard | Promo, punti, reward, returning light |
| CRM/email/SMS | Solo V3, con consenso separato |

### Impatto sulla promessa commerciale

Walbox può dire:

> “Ogni ordine pagato può generare punti, promo e ritorno cliente. Tu vedi quali promo funzionano e quali clienti/tavoli partecipano.”

Walbox non deve dire in V1.5:

> “Ti do un CRM completo” oppure “facciamo marketing automatico ai tuoi clienti”.

### Impatto sulla roadmap

| Fase | Aggiornamento dopo R006 |
|---|---|
| V1 | Preparare ordine/payment status e nickname/sessione come base dati |
| V1.5 | Punti base, stamp card, promo QR, reward semplice, dashboard loyalty |
| V2 | Reward engine, campaign engine, referral, badge, leaderboard, segmenti light |
| V3 | CRM, email/SMS, tier, birthday reward, marketing automation |

### Nuovo criterio prodotto

Ogni interazione deve diventare una catena misurabile:

```text
nickname → ordine → pagamento paid → punti/promo/reward → TV/live moment → dashboard valore → ritorno cliente
```

---

## Consolidamento strategico R007/R012 — Experience OS completo

Dopo R007-R012, Walbox Venue OS ha una direzione più chiara: non basta avere ordini, pagamenti e punti. Il prodotto deve creare **motivi per partecipare e tornare**, e deve dimostrarne il valore.

### Nuova promessa strategica consolidata

> **Walbox è la mini-app esperienziale del locale: i clienti ordinano, pagano, partecipano, guadagnano punti, appaiono nei momenti live sicuri e tornano perché hanno progressi, reward e appartenenza.**

### Nuova formula prodotto

```text
Order/Kitchen OS + Payment Bridge + Loyalty Light + Live Venue Channel + Dashboard Value + Return Loops
```

### Roadmap aggiornata post-R012

| Fase | Nome | Obiettivo | Feature chiave |
|---|---|---|---|
| **V1 competitivo** | Order/Kitchen reale | reggere servizio e status cliente | menu, ordine, KDS, banco, report base |
| **V1.5 serio** | Payment + Loyalty + Live Pulse | differenziarsi e vendere valore | Satispay/SumUp, punti, stamp card, promo, TV live, tavolo on fire, save progress |
| **V2 operativo** | Venue OS | serate/eventi e retention leggera | Mission Night, Quiz Night, wallet, leaderboard tavoli, social wall moderato, event report |
| **V3 gestionale/CRM light** | Retention + Integration | CRM opt-in e integrazioni | marketing consent, reactivation, POS/cassa partner, campaign attribution |

### Nuova priorità V1.5

La V1.5 non deve essere solo “pagamenti + loyalty”. Deve diventare:

```text
Payment + Loyalty + Live Pulse Core
```

Scope V1.5 consigliato:

1. pagamento app tramite provider locale;
2. punti/timbri solo dopo `paid`;
3. promo QR misurabile;
4. tavolo on fire;
5. TV default loop + live interruptions;
6. mood poll;
7. reward moment;
8. save progress opzionale;
9. report serata value-first;
10. safe mode TV.

### Nuova priorità V2

La V2 deve trasformare Walbox da sistema operativo del servizio a sistema operativo della serata:

1. Mission Night Light avanzata;
2. Quiz Night;
3. leaderboard tavoli/team;
4. event calendar;
5. wallet pass;
6. social wall moderato;
7. event analytics;
8. community loops manuali/opt-in.

### Nuovo messaggio commerciale

Per pub/Walrus:

> “Non ti vendo solo un QR menu. Ti do la mini-app del tuo locale: i clienti ordinano, pagano, partecipano alla serata, guadagnano punti e tu vedi cosa ha generato valore.”

Per bar/gelaterie:

> “Menu, ordini, punti e tessera digitale senza app. I clienti tornano perché vedono progressi e premi, tu vedi quali promo funzionano.”

Per gestore pragmatico:

> “Non ti chiedo di cambiare cassa. Walbox lavora sopra il tuo flusso: ordini, pagamenti, punti, promo e report serata.”

### Cosa non vendere ancora

In V1.5 non vendere:

- CRM completo;
- marketing automatico;
- social wall aperto;
- quiz completo senza host;
- jukebox automatico con playback commerciale non verificato;
- POS/fiscalità;
- revenue incrementale avanzata;
- profilo cliente dettagliato;
- email/SMS/WhatsApp automatici.

### Posizionamento rispetto ai competitor

Qromo/Cassa/Tilby/Tavolinux possono dire:

> “Gestiamo menu, ordini, pagamenti, cassa e operatività.”

Walbox deve dire:

> “Ti do il layer che rende il locale interattivo e misura quanto quell'interazione genera ordini, pagamenti, punti, promo e ritorno cliente.”

### Strategia commerciale per piccoli locali italiani

- Pub: vendere atmosfera, TV, tavoli, missioni, jukebox request, combo e serate.
- Bar: vendere stamp card, colazioni, fascia lenta, ordine semplice, report.
- Gelaterie: vendere tessera digitale, gusto del giorno, topping reward, family-safe engagement.
- Locali eventi: vendere QR + TV + Mission/Event Mode.

### Nuovi rischi strategici

| Rischio | Mitigazione |
|---|---|
| Gamification percepita come giocattolo | collegare ogni meccanica a ordine, paid, reward o dashboard |
| TV diventa caos | safe mode, moderazione, loop + interruptions |
| Loyalty diventa CRM pesante | Progressive Identity Ladder |
| Reward erodono margine | premio controllato, costo stimato, reward emozionali |
| Staff sovraccarico | Mission Night Light prima di Quiz Night |
| Privacy su nickname/contenuti | consenso separato, default tavolo aggregato |

### Nuovo criterio prodotto

Ogni nuova feature deve superare questo test:

```text
Aiuta il cliente a partecipare, ordinare, pagare, guadagnare o tornare?
Aiuta il gestore a vedere valore misurabile?
Riduce o aumenta il caos operativo?
```

---

## Aggiornamento 2026-06-28 — Checkpoint Kitchen V1.1 e posizione TV

### Stato prodotto aggiornato

Walbox Kitchen ha raggiunto lo stato **V1.1 pre-pilot stabilizzata**.

Questo significa che il modulo **Order / Kitchen OS** è il blocco più maturo del progetto:

```text
QR/table entry → menu → cart → order → pay at counter → staff confirmation → kitchen → ready → delivered → customer status
```

Il checkpoint V1.1 non trasforma ancora Walbox in Venue OS completo. Conferma che la base operativa può essere portata a smoke test produzione e pilot controllato.

### Decisione strategica aggiornata

> Non aggiungere complessità prima del pilot. Validare Kitchen V1.1, auditare TV separatamente, poi decidere V1.5.

### Ruolo della TV dopo il checkpoint

La TV resta parte centrale del posizionamento Walbox, perché differenzia il prodotto dai QR menu/POS tradizionali. Tuttavia, il checkpoint V1.1 non certifica lo stato tecnico della TV.

Per questo la roadmap immediata diventa:

| Step | Obiettivo |
|---|---|
| Repo check | confermare micro-fix mascotte e stato main |
| Kitchen smoke | validare produzione su cliente/staff/cucina |
| TV Route & Data Audit | capire route, componenti, dati, produzione e safe mode |
| Pilot decision | decidere Kitchen-only oppure Kitchen + Safe TV |
| Pilot controllato | osservare servizio reale |
| V1.5 scope | solo dopo dati reali |

### Confine V1.1 / V1.5

| Modulo | Stato dopo checkpoint |
|---|---|
| Kitchen / Order OS | V1.1 pilot-ready controllato |
| TV / Live Screen | strategica, audit pending |
| Payment Bridge | V1.5, non ora |
| Loyalty Light | V1.5, non ora |
| Dashboard Value completa | V1.5/V2, non ora |
| Mission Night / Quiz | V2, non ora |
| POS / fiscale | V3/partner, non ora |

### Regola anti-dispersione

Ogni nuova richiesta prodotto deve essere classificata prima di agire:

```text
Bug V1.1 operativo?
TV audit/safe mode?
V1.5 candidate?
V2/V3 backlog?
Da evitare ora?
```

Solo i primi due gruppi possono entrare nel lavoro immediato.

---

## Addendum 2026-06-28 — Walrus Kitchen Brand Direction

### Nuova evidenza

Il team Walrus ha scelto una reference packaging nero/gialla e ha espresso interesse per slogan come:

```text
PANINI IGNORANTI
FAME EDUCATA
```

### Decisione strategica

Per il caso Walrus Kitchen, la differenziazione non deve essere “pub grunge generico” né comunicazione basata principalmente su profanity.

La direzione migliore è:

```text
food brand ironico, street premium, nero/giallo, memorabile, vendibile
```

### Impatto su Walbox

Walbox deve dimostrare di poter trasformare il QR/order/kitchen in una mini-app del locale con voce e identità proprie.

Per Walrus questo significa:

- TV pickup coerente con packaging;
- customer app coerente con package;
- promo e copy in stile food-brand;
- QR/poster coerenti;
- tono ironico ma più vendibile di “Always That Fucking Walrus”.

### Impatto sulla roadmap

Non cambia la sequenza operativa:

```text
Kitchen V1.1 → smoke produzione → TV audit → pilot decision → eventuale visual refresh
```

Cambia però la fonte creativa da usare quando si farà il refresh.

