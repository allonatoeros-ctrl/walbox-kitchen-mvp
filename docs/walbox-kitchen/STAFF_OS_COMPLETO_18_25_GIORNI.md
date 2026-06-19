
**Obiettivo:** trasformare Walbox Kitchen da V1 pilotabile a vero sistema operativo staff per bancone, cucina, gestione ordine, storico, controllo e dati.

---

## 1. Sintesi

La Release 1 attuale ha già risolto il problema centrale:

> la cucina prepara solo dopo pagamento confermato dal bancone.

La V1 pilotabile serve a rendere questo flusso utilizzabile in una serata reale.

Il sistema staff completo, invece, è un passo più grande.

Non riguarda solo il flusso ordine base, ma tutta l’organizzazione interna del locale:

- bancone;
- cucina;
- annullamenti;
- storico;
- timer;
- note;
- allergie;
- prodotti non disponibili;
- modifica ordine;
- ruoli;
- log azioni;
- report;
- problemi tecnici;
- modalità servizio intenso;
- monitor pubblico;
- possibili integrazioni future.

Questo è già il primo nucleo di **Walbox Staff OS**.

---

## 2. Differenza tra V1 pilotabile e sistema completo

### V1 pilotabile

Serve per usare Walbox Kitchen in una prova reale controllata.

Include:

- vista bancone;
- vista cucina;
- pagamento al banco;
- ordine in cucina solo dopo pagamento;
- pronto;
- ritirato;
- annullamento semplice;
- storico leggero;
- timer base;
- note/allergie base.

### Sistema staff completo

Serve per rendere Walbox Kitchen uno strumento stabile e professionale per il locale.

Include anche:

- permessi staff;
- ruoli separati;
- storico avanzato;
- log azioni;
- ricerca ordine;
- modifica ordine;
- prodotti non disponibili;
- note interne staff;
- gestione ordini problematici;
- report;
- controllo connessione;
- modalità servizio intenso;
- monitor pubblico ordini pronti;
- predisposizione stampa comande;
- compatibilità futura con pagamento online.

---

## 3. Moduli principali da sviluppare

## 3.1 Vista Bancone avanzata

La vista bancone deve diventare il centro di controllo operativo.

Deve mostrare:

- ordini in attesa pagamento;
- ordini pagati;
- ordini in preparazione;
- ordini pronti da ritirare;
- ordini pronti da troppo tempo;
- ordini problematici;
- storico ordini;
- ordini annullati.

Deve permettere:

- confermare pagamento;
- segnare ritirato;
- annullare ordine;
- modificare ordine;
- vedere note cliente;
- vedere allergie/intolleranze;
- aggiungere note interne;
- cercare ordine;
- consultare storico;
- disattivare prodotti se autorizzato.

---

## 3.2 Vista Cucina avanzata

La vista cucina deve rimanere semplice, ma più robusta.

Deve mostrare:

- ordini da preparare;
- ordini in preparazione;
- ordine di priorità;
- numero ordine;
- nickname;
- prodotti;
- quantità;
- modifiche;
- note cliente;
- allergie/intolleranze;
- tempo trascorso dal pagamento;
- ora ingresso in cucina.

Deve permettere solo:

- cliccare `IN PREPARAZIONE`;
- cliccare `PRONTO`;
- leggere note;
- leggere allergie;
- vedere urgenze.

Non deve mostrare:

- funzioni pagamento;
- gestione prezzi;
- storico completo;
- funzioni amministrative;
- modifica ordine;
- annullamento libero.

---

## 3.3 Permessi staff

Serve distinguere almeno tre ruoli:

```text
Bancone
Cucina
Admin / Responsabile
```

### Bancone

Può:

- vedere ordini in attesa pagamento;
- confermare pagamento;
- segnare ritirato;
- annullare ordine;
- modificare ordine;
- vedere storico;
- gestire ritiro cliente.

### Cucina

Può:

- vedere ordini pagati;
- vedere prodotti e quantità;
- leggere note e allergie;
- segnare in preparazione;
- segnare pronto.

Non può:

- confermare pagamento;
- modificare prezzo;
- modificare ordine;
- annullare ordine;
- segnare ritirato.

### Admin / Responsabile

Può:

- gestire utenti;
- gestire menu;
- disattivare prodotti;
- vedere report;
- correggere errori;
- accedere allo storico completo;
- visualizzare log azioni.

---

## 3.4 Storico avanzato

Lo storico deve diventare consultabile e utile per risolvere problemi.

Ricerca per:

- codice ordine;
- nickname;
- stato;
- orario;
- data;
- metodo di pagamento;
- prodotti ordinati.

Serve per gestire casi come:

- cliente dice di aver pagato;
- ordine non trovato;
- ordine consegnato alla persona sbagliata;
- prodotto mancante;
- contestazione;
- errore dello staff.

---

## 3.5 Log azioni

Il sistema deve registrare le azioni importanti.

Esempio:

```text
Ordine #024 creato alle 20:12
Pagamento confermato da Luca alle 20:14
In preparazione da Cucina alle 20:16
Pronto alle 20:25
Ritirato da Sara alle 20:30
```

Il log serve per:

- capire errori;
- verificare responsabilità;
- analizzare tempi;
- risolvere contestazioni;
- migliorare il servizio.

Non deve essere sempre visibile a tutti, ma deve essere disponibile per admin o responsabile.

---

## 3.6 Annullamento avanzato

L’annullamento deve essere controllato.

Motivo obbligatorio:

- mancato pagamento;
- cliente assente;
- ordine duplicato;
- prodotto non disponibile;
- errore cliente;
- errore staff;
- altro.

L’annullamento deve:

- chiedere conferma;
- salvare motivo;
- salvare chi ha annullato;
- finire nello storico;
- comparire nel log azioni.

---

## 3.7 Modifica ordine

Il bancone o il responsabile devono poter modificare un ordine quando necessario.

Casi possibili:

- cliente ha sbagliato prodotto;
- cliente vuole togliere qualcosa;
- prodotto non disponibile;
- quantità errata;
- ordine duplicato;
- nota da correggere;
- prezzo da sistemare.

La cucina non dovrebbe modificare l’ordine.

La modifica deve essere salvata nel log.

---

## 3.8 Prodotti non disponibili

Serve una funzione per disattivare velocemente prodotti o varianti non disponibili.

Esempi:

- patatine finite;
- ingrediente terminato;
- dolce non disponibile;
- bevanda esaurita.

Quando un prodotto viene disattivato:

- il cliente non deve poterlo ordinare;
- lo staff deve vederlo come non disponibile;
- il menu cliente deve aggiornarsi.

Questa funzione evita ordini impossibili da preparare.

---

## 3.9 Note cliente, allergie e note interne

Il sistema deve distinguere tre tipi di informazioni:

```text
Note cliente
Allergie / intolleranze
Note interne staff
```

### Note cliente

Esempi:

- senza cipolla;
- salsa a parte;
- poco piccante;
- tagliare a metà.

### Allergie / intolleranze

Devono essere separate e molto visibili.

Esempio:

```text
ATTENZIONE: ALLERGIA FRUTTA SECCA
```

### Note interne staff

Visibili solo a bancone e cucina.

Esempi:

- cliente ha fretta;
- cliente aspetta davanti al banco;
- non preparare ancora, verificare pagamento;
- manca ingrediente, parlare con cliente.

---

## 3.10 Timer avanzati

Timer utili:

- tempo da invio ordine;
- tempo da pagamento;
- tempo in preparazione;
- tempo da quando è pronto.

Il timer più importante per la cucina è:

```text
tempo da pagamento a pronto
```

Colori consigliati:

```text
normale
arancione
rosso
```

Esempio:

```text
Pagato da 8 minuti → normale
Pagato da 15 minuti → attenzione
Pagato da 25 minuti → critico
```

---

## 3.11 Ordini non pagati da troppo tempo

Gli ordini in attesa pagamento non devono restare per sempre nella schermata.

Regola consigliata:

- dopo 10/15 minuti: evidenziare;
- dopo 30 minuti: permettere annullamento rapido;
- eventuale annullamento automatico configurabile in futuro.

La cucina non deve mai vedere questi ordini.

---

## 3.12 Ordini pronti non ritirati

Gli ordini pronti devono restare visibili finché il bancone non clicca `RITIRATO`.

Regola consigliata:

- pronto da meno di 10 minuti: normale;
- pronto da più di 10 minuti: evidenziato;
- pronto da più di 20 minuti: avviso forte.

Esempio:

```text
#024 — Marco — Pronto da 12 min
```

---

## 3.13 Monitor pubblico ordini pronti

Opzione utile per migliorare il ritiro.

Schermata visibile ai clienti:

```text
Ordini pronti:
#021
#024
#027
```

Per privacy mostrare solo:

- numero ordine;
- eventualmente nickname abbreviato.

Esempio:

```text
#024 — M.
```

---

## 3.14 Gestione bevande e prodotti già pronti

Non tutti i prodotti richiedono cucina.

Esempi:

- bibite;
- dolci già pronti;
- prodotti confezionati;
- snack;
- acqua;
- caffè;
- prodotti da banco.

Serve distinguere categorie interne:

```text
cucina
banco
bevande
dolci
extra
```

Nella prima versione completa può bastare una distinzione leggera.

---

## 3.15 Report utili

Report consigliati:

- numero ordini giornalieri;
- prodotti più venduti;
- orari di picco;
- tempo medio di preparazione;
- ordini annullati;
- motivi di annullamento;
- ordini non ritirati;
- prodotti spesso non disponibili;
- tempo medio da pagamento a pronto.

Questi dati aiutano a migliorare:

- organizzazione staff;
- menu;
- preparazione;
- quantità di ingredienti;
- turni;
- gestione dei picchi.

---

## 3.16 Connessione e problemi tecnici

Il sistema deve gestire problemi come:

- internet instabile;
- tablet disconnesso;
- ordine non sincronizzato;
- doppio invio;
- aggiornamento stato non riuscito;
- schermata non aggiornata.

Messaggi consigliati:

```text
Connessione persa. Gli ordini potrebbero non essere aggiornati.
```

```text
Aggiornamento non riuscito. Riprova.
```

```text
Ordine sincronizzato correttamente.
```

---

## 3.17 App staff sempre attiva

L’app staff deve rimanere aperta durante il servizio.

Requisiti:

- schermo sempre acceso;
- sessione stabile;
- aggiornamento ordini;
- nessun refresh manuale continuo;
- dispositivo collegato alla corrente;
- UI leggibile da distanza;
- indicatore ultimo aggiornamento.

Nota importante:

> evitare lo standby dipende anche dalle impostazioni del tablet/PC, non solo dal codice.

Quindi serve sia UI sia procedura operativa.

---

## 3.18 Stampa comande futura

Da valutare dopo uso reale.

Opzioni:

### Solo schermo

Vantaggi:

- meno carta;
- aggiornamenti in tempo reale;
- tutto digitale.

Svantaggi:

- serve schermo sempre acceso;
- serve connessione stabile;
- serve posizione comoda in cucina.

### Schermo + stampa

Vantaggi:

- comanda fisica utile in cucina;
- riduce dimenticanze;
- più familiare per alcuni staff.

Svantaggi:

- stampante;
- carta;
- complessità tecnica.

Per ora non è priorità, ma il sistema deve poterla supportare in futuro.

---

## 4. Piano 18–25 giorni

### Fase 1 — Consolidamento V1 pilotabile

Durata stimata:

```text
5–7 giorni
```

Include:

- Vista Bancone;
- Vista Cucina;
- Ritirato;
- Annullamento semplice;
- Storico leggero;
- Timer base;
- Note/allergie base;
- test finale.

---

### Fase 2 — Controllo operativo avanzato

Durata stimata:

```text
4–5 giorni
```

Include:

- annullamento con motivo obbligatorio;
- ordini pronti da troppo tempo;
- ordini in attesa pagamento da troppo tempo;
- note interne staff;
- miglioramento storico;
- ricerca ordine.

---

### Fase 3 — Ruoli, log e sicurezza

Durata stimata:

```text
4–5 giorni
```

Include:

- ruoli staff base;
- permessi bancone/cucina/admin;
- log azioni;
- protezione azioni critiche;
- recupero errori operativi.

---

### Fase 4 — Gestione menu e servizio

Durata stimata:

```text
3–4 giorni
```

Include:

- prodotti non disponibili;
- categorie interne cucina/banco/bevande;
- modifica ordine;
- miglioramento gestione note e allergie;
- controlli su prodotti non ordinabili.

---

### Fase 5 — Report, monitor e rifinitura

Durata stimata:

```text
3–4 giorni
```

Include:

- report semplici;
- monitor pubblico ordini pronti;
- indicatori connessione;
- app staff sempre attiva;
- polish UI servizio intenso;
- QA completa.

---

## 5. Cosa resta fuori anche dal sistema completo V1

Anche nel sistema staff completo non conviene includere subito:

- pagamento online;
- integrazione POS;
- integrazione cassa fiscale;
- registratore telematico;
- rimborsi automatici;
- stampante comande reale;
- inventario materie prime completo;
- loyalty completa;
- app nativa iOS/Android;
- CRM avanzato;
- marketing automation.

Questi sono step successivi.

---

## 6. Definition of Done

Il sistema staff completo è pronto quando:

- bancone e cucina hanno viste separate;
- ogni ruolo vede solo ciò che serve;
- pagamento al banco controlla ingresso in cucina;
- cucina prepara solo ordini pagati;
- bancone gestisce ritiro;
- annullamento è tracciato con motivo;
- storico è consultabile;
- log azioni registra i passaggi importanti;
- note e allergie sono separate;
- prodotti non disponibili possono essere disattivati;
- ordini pronti/non pagati da troppo tempo sono evidenziati;
- staff può lavorare durante servizio intenso senza confusione;
- report base aiutano il locale a capire il servizio;
- build e test principali passano;
- flusso è verificato su dispositivi reali.

---

#