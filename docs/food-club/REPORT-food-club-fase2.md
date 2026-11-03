# WALRUS FOOD CLUB V1 — Fase 2: prototipo UX/UI · consegna

Data: 2026-11-03 · Base visiva: branch `feat/restyling-hero` (il nuovo menu di PR #6, non ancora in `main`).

**Esito:** il prototipo è pronto e verificato a 390 e 430 px. Le **query non sono state eseguite**: questa sessione non può
raggiungere il database. Il file SQL è pronto e validato, va lanciato da Eros (§4).

**Repository:**
- **nessun file modificato**: `git status` dà 0 righe;
- nessuna migration, nessun commit, nessun push, nessun deploy;
- nessuna chiamata alla produzione.

Tutto il materiale è in `docs/food-club/` (branch `docs/food-club-fase2`).

---

## 1. File HTML cliccabile

**`docs/food-club/walrus-food-club-prototipo.html`**
(773 KB, un solo file, funziona offline).

### Uso
- Si apre nel browser. Conviene il telefono, oppure DevTools a 390 o 430 px.
- Il bottone grigio **☰ PROTOTIPO** (in basso a destra) apre l'elenco di tutti gli stati: 21 passi del percorso,
  13 casi particolari e 5 viste staff.
- Ogni voce ricarica uno stato coerente.
- Il percorso si può fare anche **solo cliccando** nell'interfaccia, dall'inizio alla fine.
- Accesso diretto a uno stato: `…prototipo.html#p7low`. Con `?clean=1` spariscono gli strumenti del prototipo.
- I riquadri grigi tratteggiati "SIMULAZIONE" non sono app. Simulano lo staff in cassa ("segna PAGATO", "non pagato
  → annullato") e il passare delle serate.

### Come è costruito (fedeltà)
- **CSS dell'app incluso tale e quale.** È il bundle compilato da una copia isolata del branch, quindi colori, font, raggi
  e proporzioni sono quelli veri. Non è stata creata nessuna palette nuova.
- **Testata, hero, linguette, testata categoria, schede prodotto e pannello CATEGORIE** sono l'HTML **renderizzato
  dall'app reale**, estratto con Playwright e riusato senza modifiche.
- **Sacco e checkout** usano le stesse classi reali: `kitch-drawer*`, `kitch-pairing-banner`, `cx-*`, `kb-ticket`.
- **Classi nuove: solo `fc-*`**, costruite sui token `--poster-*` (`CustomerKitchenMenu.css:26-49`) e sulle grammatiche esistenti:
  - biglietto tratteggiato `.kb-ticket` → tessera e buono;
  - timbro tondo `.kp-stamp` → timbri di visita;
  - CTA gialla `.cx-pay`;
  - selettore `.cx-where-btn` → filtri del portafoglio.
- **Staff**: overlay `kss-overlay--fullscreen` come STORICO, con le tessere KPI `kpd-*` e i token `--kss-*`.
- **Font self-hosted** (League Gothic, Montserrat, Anton) e foto reali dei prodotti, ridimensionate.

### Regole simulate (decisioni Fase 2)
- Una visita conta con almeno **10 € di food**. Il buono è da **5 €**, usabile con almeno **12 € di food** (provvisorio)
  e valido **30 giorni**.
- Servono **2 serate diverse** (taglio alle **06:00**) **entro 30 giorni**. Le bevande non contano.
- Gli ordini **creati dallo staff in cassa non contano**.
- **Il buono si consuma solo a pagamento confermato.** Con PAGO AL BANCO resta **RISERVATO**. Se l'ordine non viene
  pagato o viene annullato, **torna valido con la scadenza originale**.
- Nessun SMS promozionale: l'SMS serve solo per il codice di accesso.

---

## 2. Anteprime

Cartella `docs/food-club/anteprime/`:

| File | Contenuto |
|---|---|
| `confronto-reale-vs-prototipo-390.png` / `-430.png` | **Walbox reale accanto al prototipo**: menu, pannello categorie, sacco, fondo del sacco |
| `confronto-staff-1280.png` | STORICO reale accanto all'overlay CLUB del prototipo |
| `percorso-cliente-390.png` / `-430.png` | I 18 schermi del percorso 1 → 9 |
| `casi-particolari-390.png` / `-430.png` | 12 casi particolari |
| `staff-club.png` | Le 5 viste staff a 1280 px + panoramica a 430 px |

Gli screenshot singoli (prototipo e app reale) non sono nel repository: si rigenerano aprendo il prototipo,
che ha un accesso diretto per ogni stato (`#p1`, `#p7low`, …).

---

## 3. Percorso cliente

| # | Passo | Cosa vede | Stato nel prototipo |
|---|---|---|---|
| 1 | **Scopre il Club dal menu** | Striscia sotto la testata: "WALRUS FOOD CLUB · GRATIS — 2 visite food = 5 € sul prossimo ordine" (chiudibile ×). Nel pannello ☰ CATEGORIE c'è un nuovo gruppo "WALRUS FOOD CLUB". | `p1`, `p1cats` |
| 2 | **Si iscrive gratis** | Pagina Club (come funziona in 3 passi), poi numero di telefono con privacy obbligatoria e promo facoltativa separata, poi codice SMS a 6 cifre (rimando dopo 42 s), poi "CI SEI, ANNA." | `p2` → `p2a` → `p2b` → `p2c` |
| 3 | **Tessera con zero timbri** | Biglietto tratteggiato con 2 timbri vuoti, regole, "Ancora nessuna visita" (mascotte chef). | `p3` |
| 4 | **Primo acquisto valido** | Nel sacco: "QUESTO ORDINE FA TIMBRO". Paga al banco: lo stato ordine mostra **TIMBRO IN ATTESA** (timbro tratteggiato). Lo staff segna pagato: **+1 TIMBRO**. La tessera mostra "Ti restano 30 giorni". | `p4cart` → `p4pcp` → `p4paid` → `p4tess` |
| 5 | **Torna un'altra sera e sblocca il buono** | Venerdì 13/11, paga online (SumUp simulato): **BUONO DA 5 € SBLOCCATO!** con i due timbri pieni. | `p5cart` → `p5paid` |
| 6 | **Vede premio e scadenza** | Portafoglio VALIDI / USATI / SCADUTI. Buono mattone "5 €" con "valido fino al 13/12" e codice WFC-7KQ2. Home Club con il buono in cima. Striscia rossa nel menu "HAI UN BUONO DA 5 €". | `p6`, `p6home`, `p6menu` |
| 7 | **Applica il buono nel sacco** | Sotto soglia: "food 8,00 € su 12 €: ti mancano 4,00 €", barra e suggerimento a un tocco (+ Patate al Forno). Sopra soglia: **USALO**, poi "BUONO APPLICATO". Il totale passa da ~~19,00~~ a **14,00 €**. Se il food torna sotto soglia, il buono si toglie da solo con avviso. | `p7low` → `p7on` |
| 8 | **Online o al banco** | Online: pagamento confermato, buono **USATO**. Al banco: buono **RISERVATO** e banner "da pagare 14,00 € (buono Club già scalato)". Sotto PAGO AL BANCO compare "il banco vede già lo sconto". | `p8online`, `p8pcp` |
| 9 | **Invita un amico** | Codice ANNA-7K con link, CONDIVIDI (condivisione del telefono) e COPIA. Contatori iscritti / hanno ordinato / guadagnati, elenco con sole iniziali, regole. | `p9` |

### Casi particolari richiesti

| Caso | Cosa succede | Stato |
|---|---|---|
| **Ordine insufficiente per il timbro** | Mortazza + Helles = 11 € totali ma **5 € di food**: "NIENTE TIMBRO STAVOLTA", con spiegazione che le bevande non contano | `cNoStamp` |
| Secondo ordine nella stessa serata | "TIMBRO DI STASERA GIÀ PRESO", perché la serata finisce alle 06:00 | `cSame` |
| **Carrello insufficiente per il premio** | Barra, importo mancante, suggerimento, USALO disattivato | `cLow` / `p7low` |
| **Buono scaduto** | Tab SCADUTI con il buono barrato. Nel sacco, un avviso una sola volta: "Il tuo buono è scaduto… questo ordine può fare timbro" | `cExpired`, `cExpMenu` |
| **Ordine annullato** | "NIENTE DI PERSO.": il buono torna nel portafoglio con la stessa scadenza e il timbro in attesa non viene assegnato | `cCancel`, `cCancel2` |
| **Buono riservato in attesa del pagamento** | Nel portafoglio: "RISERVATO · W31 — si usa quando l'ordine W31 è pagato; se non viene pagato torna qui" | `cReserved`, `p8pcp` |
| Cliente non iscritto dopo l'ordine | Card inline "QUESTA VISITA PUÒ CONTARE" con "Non ora" (nessun popup sopra quello delle notifiche) | `cGuest` |
| Associare l'ordine appena fatto | Al passo 3 dell'iscrizione: "Ordine di stasera W12 · 14,50 € — Associalo alla tessera" | `cGuestJoin` |
| Errori iscrizione | Numero non valido, privacy non spuntata, codice SMS sbagliato | `cPhone`, `cOtp` |
| Preferenze | Notifiche, consenso marketing separato, "SMS: solo codice", messaggi, uscita, cancellazione dati | `prefs` |

### Staff · CLUB (sola lettura, dati di esempio)

| Vista | Contenuto |
|---|---|
| PANORAMICA | Iscritti · visite riconosciute (con "3 in attesa di pagamento al banco") · buoni emessi · buoni utilizzati · clienti da invito · costo promo (21 buoni + 9 premi = 150 €). Visite per serata. "Da tenere d'occhio" (buoni in scadenza, timbri in attesa, buoni riservati). |
| CAMPAGNA | Regole della campagna attiva (gestita dall'amministratore, nessuna modifica da qui) e funnel iscritti → 1 timbro → tessera completata → buono usato / scaduto. Ritorno 2ª serata, con l'avvertenza che non è un dato causale. |
| BUONI | Emessi / validi / riservati / utilizzati / scaduti, ultimi buoni con telefono mascherato. |
| ISCRITTI | Totali, attivi 30 giorni, % consenso promo, provenienza, elenco minimo (nome, ••• 4821, tessera, ultima visita). |
| INVITI | Funnel link → iscritti → primo ordine pagato → premi. Chi invita di più. |

---

## 4. Risultati delle query

### Stato: NON eseguite
Questa sessione cloud non ha accesso al database di produzione:
- nessuna credenziale e nessun connettore Supabase;
- la Preview Vercel della PR #6 è bloccata dalla policy di rete dell'ambiente (host `walbox-from-zero-v2-git-feat-ea0596-allonatoeros-ctrls-projects.vercel.app`).

**Non ho inventato numeri.**

### SQL pronto
File: `docs/food-club/food-club-verifiche-select.sql`. Contiene solo `SELECT`, query autonome.

Le query sono state validate su un **Postgres locale usa e getta** con schema minimo e dati sintetici: zero errori,
risultati controllati a mano (es. 11,90 + 3,50 = 15,40 € di food).
I risultati sintetici **non** sono dati reali.

| Query | Risponde a |
|---|---|
| Q0 | Ordini per stato e pagamento negli ultimi 30 giorni (controllo con i "727 pagati") |
| **Q1** | **% ordini food pagati ≥ 10 / 12 / 15 / 20 €**, media e mediana food, ordini con articoli non mappati |
| Q1b | Elenco degli `item_id` non mappati, per correggere Q1 |
| **Q2** | **Ordini staff (cassa assistita) vs ordini cliente**, totali e pagati, pagati online vs al banco |
| Q2b | Controllo incrociato `customer_id` → utente non anonimo, cioè sessione staff (serve lettura su `auth.users`) |
| **Q3** | **Limiti nel riconoscere gli abituali**: ordini senza `customer_id`, id con ≥ 2 serate in 30 giorni, id con ≥ 3 nickname, id con ≥ 3 ordini nella stessa serata |
| Q3b | Top 10 id per numero ordini (id troncato, nickname): dispositivi condivisi o persone? |

**Da fare (Eros):** lanciare il file con il ruolo in sola lettura (MCP Supabase di progetto sul tuo computer, oppure SQL
editor) e incollarmi gli output. Con Q1 confermo o correggo la soglia dei 12 €.

### Limiti dei dati già certi dal codice (indipendenti dalle query)
- **Nessuna categoria food lato server.** `kitchen_menu_items` e `kitchen_order_items` non hanno categoria. La mappa usata
  nell'SQL è copiata dal client (`kitchenMockData.js` + `CATEGORY_BY_ITEM_ID` in `kitchenServiceRules.js:425-436`).
  Gli articoli storici fuori catalogo risultano "non mappati" (Q1b li conta).
- **Il cliente oggi è un dispositivo, non una persona.**
  - `customer_id` è un utente anonimo per browser.
  - Più persone su un telefono hanno un solo id.
  - Cambiando browser o telefono si ottiene un id nuovo.
  - Gli anonimi inattivi vengono cancellati dopo 90 giorni (`20261030140000`).
  - **Le percentuali di ritorno di Q3 sono quindi una stima grezza**: sottostimano chi cambia dispositivo e sovrastimano
    chi condivide il telefono.
- **Ordini di cassa:** `nickname = 'BANCO'` + marcatore nella nota (`CounterAssistedOrder.jsx:35-41`). Che il `customer_id`
  sia dello staff è dedotto dalla RPC; Q2b lo verifica.
- **Due "giorni":** `service_day` nel database è la data di calendario, mentre la serata ha il taglio alle 06:00. L'SQL
  usa la serata (decisione approvata).
- **Locale:** il codice conosce un solo `venue_id = 'walrus-main'`. Va confermato che corrisponda a Melegnano.

---

## 5. Verifica grafica (390 / 430)

### Metodo
1. **App reale avviata da una copia isolata del branch** nella cartella della sessione (`npm ci --ignore-scripts` solo lì,
   non nel repo), con Supabase puntato a un indirizzo locale inesistente. L'unica richiesta esterna tentata è stata
   bloccata (127.0.0.1:54321).
2. Screenshot reali a 390 e 430: menu, pannello categorie, schede, dock, sacco, checkout, stato ordine vuoto. A 1280:
   `/kitchen/solo` in anteprima e STORICO.
3. Screenshot del prototipo per **38 stati × 2 larghezze** + 5 viste staff a 1280.
4. **Controlli automatici su ogni stato:**
   - scroll orizzontale;
   - bottoni sotto 44 × 44 px;
   - elementi fuori schermo;
   - testo sotto 12 px;
   - testo troncato;
   - errori JS.
   Più una verifica dedicata dei titoli sotto il logo.
5. **Percorso completo cliccato** come un utente: **31/31 passaggi PASS**, 0 errori JS.
6. Revisione a occhio di tutte le tavole e confronto fianco a fianco con le schermate reali.

**Esito finale:** 76 stati mobili + 5 staff con **0 segnalazioni**.

### Problemi trovati e corretti durante la verifica

| Problema | Causa | Correzione |
|---|---|---|
| Errore JS in 4 stati del sacco | La previsione del timbro calcolava un valore assente | Calcolo solo per il caso usato |
| **Bottoni PAGO ORA / AL BANCO tagliati in basso** | `.cx-footer` è sticky **solo dentro `.cx`**: le righe Club messe prima di `.cx` lo spingevano fuori schermo | Righe Club **dentro `.cx`** come primo blocco. **Vale anche per l'app vera (§7).** |
| Sottotitoli in MAIUSCOLO con spaziatura | Regola globale `button` in `index.css:83-88` | `text-transform: none` sulle righe-bottone Club |
| Schede prodotto attaccate ai bordi | Mancava il contenitore reale | Usato `pm-root` / `pm-list` reali (16 px, gap 22) |
| "×" della striscia oltre il bordo · link "modifica" alto 19 px · interruttori alti 34 px | Misure | Area di tocco ≥ 44 px |
| Testo a 11 px nelle righe del sacco | Classe reale `kitch-drawer-row-detail` | Classe Club da 12,5 px |
| Titolo "NOTIFICHE E PRIVACY" sotto il logo a 390 px | Lunghezza | Titolo "PREFERENZE" + controllo dedicato |
| Linea grigia accanto al logo nella topbar | Bordo del file del logo | Ritaglio del 2 % |
| "€" a capo da solo | Spazio normale | Spazi non separabili (67 punti) |
| "BENVENUTA, ANNA" | Genere dedotto dal nome | Testo neutro "CI SEI, ANNA." |
| Staff: filtri alti 28 px, etichette 11 px | **Debito già presente nello STORICO reale** (`kpd-sumup-badge`, `kpd-cash-label`) | Nel CLUB alzati a 44 px / 12 px, senza toccare STORICO |

### Differenze rimaste, tutte volute o da decidere
- **Lo stato ordine reale usa ancora la palette vecchia** (`#1c1008`, Anton, colori di stato vecchi). La card Club in stile
  poster si distingue. È la decisione D6 della Fase 1: allineamento della pagina in un micro-task separato.
- **La striscia per i non iscritti** abbassa la hero di 52 px alla prima apertura. Va decisa (§6).
- Rispetto al sacco reale, nel prototipo:
  - **il nome è già compilato** e "MANGIO QUI" già scelto, per arrivare subito allo stato "pronto";
  - **mancano il cestino** sulle righe e il blocco **note per la cucina**;
  - sono semplificazioni del prototipo, non proposte.
- La pagina SumUp è una simulazione neutra: in app è la pagina esterna reale.

---

## 6. Problemi ancora aperti

### Decisioni di prodotto (Eros)

| ID | Tema | Nota |
|---|---|---|
| A1 | **Soglia di riscatto 12 €** | In attesa di Q1 |
| A2 | **Buono riservato su ordini al banco mai pagati** | **Oggi un ordine PCP non scade da solo**: la chiusura automatica dei 5 minuti vale solo per gli ordini online (`api/_lib/onlineAbandonSweep.js:32`, filtro `pending_online_payment`). Il buono resterebbe RISERVATO finché lo staff non annulla. Proposta: rilascio automatico a fine serata (06:00) se l'ordine è ancora da pagare. |
| A3 | **Vantaggio per l'amico invitato** (D9) | Nel prototipo: "da decidere". Anche il **limite di 5 premi al mese** è un segnaposto. |
| A4 | **Striscia nel menu per i non iscritti** | Sì, chiudibile (prototipo), oppure solo il pannello ☰ (proposta Fase 1). Costa 52 px sopra la hero. |
| A5 | **Sconto sul totale** (prototipo) o **solo sul food** | D3, non ancora confermata. Con soglia ≥ 12 € di food è una differenza solo contabile. Resta da verificare come compare sullo scontrino fiscale. |
| A6 | **Combo con bevanda inclusa conteggiato interamente come food** | D4, assunto nel prototipo e nell'SQL |
| A7 | **Rimborso dopo il timbro** | D11: revoca del timbro; il buono si revoca solo se non è ancora usato |
| A8 | **Campagna del 2° mese "Spendi 50 € → 5 €"** | Non prototipata: richiede una tessera a barra in € invece dei timbri. Da disegnare prima di quel mese. |
| A9 | **Nome e testi** (D13) | Sono provvisori, da validare con il locale |

### Tecnici, legali e operativi
- **Identità:**
  - serve Supabase Auth con telefono e un fornitore SMS per il codice (costo per SMS, area protetta);
  - va verificato se l'utente anonimo può diventare utente con telefono **mantenendo lo stesso id**;
  - se sì, l'ordine appena fatto e le notifiche già attive passano alla tessera senza trasferimenti.
- **Informativa privacy da riscrivere:** oggi dice "nessuna profilazione" (`KitchenPrivacy.jsx:57-58`). Servono revisione
  legale e i testi dei due consensi (servizio e marketing), da salvare con data e ora.
- **Notifiche su iPhone:** arrivano solo con Walbox installata sulla schermata Home. Per molti iscritti l'unico canale
  sarà la sezione "Messaggi" in app (decisione: niente SMS promo).
- **Pagamento al banco con carta digitata a mano** (`card_counter_manual`): lo staff deve leggere il totale **già
  scontato**. La comanda in Solo/Cassa deve mostrare "BUONO −5 €" e "DA INCASSARE" grande (non prototipato: è nella
  lista dei file).
- **Storico staff limitato a 30 giorni** (limite di 1000 righe). Le statistiche CLUB su più mesi richiedono viste aggregate
  nel database.
- **Locale:** confermare che `walrus-main` sia Melegnano.

---

## 7. File dell'app da modificare in una futura implementazione

Legenda: **[P]** = area protetta (CLAUDE.md §5), serve task dedicato e approvazione esplicita · **[N]** = file nuovo (serve
approvazione, §4). Ordine consigliato: prima la base dati e le regole, poi il cliente, poi lo staff.

### Base dati e server (prerequisiti)

| File | Perché |
|---|---|
| **[P][N]** `supabase/migrations/<ts>_food_club_v1.sql` (+ `<ts>_food_club_v1.test.js` accanto, come le altre) | Tabelle: tessere legate al telefono verificato, campagne, timbri/visite, buoni (valido / riservato / usato / scaduto), inviti. **Categoria food lato server** (colonna su `kitchen_menu_items` o tabella di mappa). RLS, grant, viste aggregate per lo staff. |
| **[P][N]** `supabase/migrations/<ts>_food_club_rpc_v1.sql` | Creazione ordine **con buono in modo atomico**: nuova versione della RPC a 5 argomenti di `20260913130000` con il codice buono. Accredito timbro e consumo buono quando l'ordine diventa `paid`. Rilascio del buono su PA, annullo e fine serata (A2). Revoca su rimborso. |
| **[P]** Configurazione Supabase Auth (telefono + fornitore SMS) | Iscrizione e accesso con codice; collegamento dell'utente anonimo |
| **[P]** `api/kitchen-sumup-create-checkout.js` | Da **verificare**, probabilmente invariato: l'importo deve restare uguale a `total` già scontato |
| **[P]** `api/kitchen-sumup-webhook.js`, `api/kitchen-sumup-reconcile.js`, `api/_lib/sumupPaymentResolution.js` | Passaggio a `paid` online: accredito e consumo buono (se non fatto interamente nel database) |
| **[P]** `api/kitchen-online-abandon-sweep.js`, `api/_lib/onlineAbandonSweep.js`, `api/kitchen-cancel-with-payment-check.js`, `api/kitchen-sumup-refund.js` | Rilascio buono e timbro su abbandono, annullo e rimborso |
| **[P]** `supabase/functions/send-order-ready-push/` (o nuova funzione **[N]**) | Notifiche "+1 timbro", "buono sbloccato", "buono in scadenza" (oggi c'è solo il testo fisso "pronto") |
| **[P]** `vercel.json` | Solo se il rilascio a fine serata (A2) diventa un cron |

### Cliente

| File | Perché |
|---|---|
| **[P]** `src/App.jsx` | `case "/kitchen/club"` (una sola route, D7) |
| **[N]** `src/pages/FoodClub.jsx` + `FoodClub.css` | Viste interne: intro, iscrizione (3 passi), home, tessera, buoni, amici, preferenze (`?v=…` per i link diretti) |
| **[N]** `src/components/kitchen/FoodClubStrip.jsx`, `FoodClubStatusCard.jsx`, `FoodClubCartRows.jsx`, `FoodClubStamp.jsx`, `FoodClubVoucher.jsx` (+ CSS) | Componenti del prototipo, classi `fc-*` |
| **[N]** `src/lib/foodClubRules.js` + `foodClubRules.test.js` | Regole pure: subtotale food, previsione timbro, soglia, date e scadenze. Riusa `serviceNightWindow` / `SERVICE_NIGHT_CUTOFF_HOUR` di `kitchenServiceRules.js`. |
| **[N]** `src/hooks/useFoodClub.js` | Tessera, buoni, messaggi, iscrizione con codice (via RPC) |
| `src/pages/CustomerKitchenMenu.jsx` | Striscia sotto `kh-brand`, gruppo Club nel pannello CATEGORIE, stato buono nel sacco, codice buono passato a `handleSubmit` |
| `src/pages/CustomerKitchenMenu.css` | **Token `--poster-*` in uno scope condiviso** (oggi solo `.kitch-page`): serve alla card su `/kitchen/status` (D6) |
| `src/components/kitchen/CustomerCheckout.jsx` / `.css` | **Righe Club come primo blocco DENTRO `.cx`** (altrimenti il footer di pagamento esce dallo schermo, verificato). Totale con sconto e sottotitolo "il banco vede già lo sconto". |
| `src/hooks/useKitchenOrders.js` | `createOrderOnServer` con codice buono; mappatura di `discount_amount` e codice buono negli ordini |
| `src/lib/kitchenServiceRules.js` | Esportare la classificazione food (`CATEGORY_BY_ITEM_ID` oggi non è esportata), o spostarla in `foodClubRules` |
| `src/pages/CustomerOrderStatus.jsx` / `.css` | Card Club inline, in sequenza con l'overlay notifiche (mai insieme). In seguito: allineamento alla palette poster (D6). |
| `src/components/kitchen/CustomerOrderPanel.jsx` | Riga "Buono Club −5,00 €" e importo "da pagare" scontato nel banner |
| `src/components/kitchen/NotificationOptIn.jsx`, `src/hooks/useWebPushSubscription.js`, `src/lib/webPush.js` | Riuso nelle preferenze (da verificare se servono modifiche) |
| `src/pages/KitchenPrivacy.jsx` | Informativa Food Club (dopo la revisione legale) |
| **[P]** `src/data/kitchenMockData.js` | Solo se la categoria food resta derivata da qui. Meglio di no: va spostata nel server. |

### Staff

| File | Perché |
|---|---|
| `src/pages/KitchenSoloService.jsx` / `.css` | Bottone **CLUB** accanto a STORICO e overlay fullscreen |
| **[N]** `src/pages/ClubView.jsx` + `ClubView.css` | Le 5 viste del prototipo (sola lettura) |
| **[N]** `src/hooks/useFoodClubStats.js` | Lettura delle viste aggregate |
| `src/components/kitchen/KitchenOrderCard.jsx`, `src/components/kitchen/OrderPaymentActions.jsx` | Badge "BUONO −5 €" e "DA INCASSARE" scontato |
| `src/pages/CounterAssistedOrder.jsx` | Solo visualizzazione dello sconto sugli ordini cliente pagati in cassa. Gli ordini creati qui restano esclusi. |
| `src/components/kitchen/AnalyticsKpiStrip.jsx` e componenti `kpd-*` | Riuso (eventuale prop per tessere aggiuntive) |

### Test

| File | Perché |
|---|---|
| `src/lib/foodClubRules.test.js` [N] | Unit test delle regole |
| `tests/unit/*` [N] | RPC e flussi di pagamento con buono |
| `tests/e2e/customer-kitchen-flow.spec.js` + nuova spec [N] | Percorso 1 → 9 (le 31 verifiche del prototipo sono una buona base) |
| E2E reali locali (skill `e2e-real-local`) | RLS, riserva e consumo del buono |

---

## Cosa approva Eros
1. **Il prototipo**: aspetto, percorso e casi particolari.
2. **Le decisioni A1–A9.** Le più urgenti sono A2 (buono riservato su ordini al banco mai pagati), A3 e A4.
3. **Il lancio delle query** in sola lettura (§4), con gli output da incollarmi.

STOP: nessuna implementazione finché il prototipo non è approvato.

## Note di trasparenza
- Fuori dal repository ho scritto solo nella cartella della sessione:
  - una copia isolata del branch con le sue dipendenze (`app/`, installate con `npm ci --ignore-scripts`);
  - la sua build (`app-dist/`);
  - script e screenshot.
- Un Postgres locale temporaneo è servito solo per validare la sintassi SQL; è stato fermato.
- Nessun accesso a produzione, Preview o database reale.
