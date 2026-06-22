# WALBOX — CLAUDE START HERE
> Root context operativo per Claude / Antigravity  
> Scopo: decidere se continuare sul repo attuale, pulirlo o creare un nuovo progetto pulito.  
> Modalità iniziale: READ-ONLY AUDIT. NO CODE. NO IMPLEMENTATION.

---

## 1. Missione attuale

Walbox deve diventare un prodotto vendibile per piccoli locali italiani: bar, pub, gelaterie, caffetterie e locali informali.

La direzione prodotto non è più solo “QR menu / kitchen”.

La direzione corretta è:

```text
Walbox Venue Experience OS = mini-app del locale + ordini + kitchen + pagamento + loyalty + TV/live screen + dashboard valore
```

Ma la priorità operativa immediata è più stretta:

```text
Chiudere una V1 competitiva Order/Kitchen prima di implementare V1.5 Payment/Loyalty/Live Pulse.
```

---

## 2. Posizionamento sintetico

Walbox non deve essere venduto come gestionale fiscale o POS completo.

Walbox deve essere venduto come:

> La mini-app del locale: il cliente entra dal QR, ordina, segue lo stato, il locale gestisce cucina/banco, e in futuro collega pagamento, punti, promo, TV e dashboard valore.

---

## 3. Competitor mental model

Non competere frontalmente con:

- Cassa in Cloud;
- Tilby;
- Tavolinux;
- POS/fiscale completi.

Competere invece come layer sopra la cassa esistente:

```text
cassa fiscale esistente = verità fiscale
Walbox = verità esperienza + ordine + kitchen + valore commerciale
```

---

## 4. Decisione da prendere ora

Prima di scrivere codice, devi decidere quale strada è migliore:

1. **KEEP** — continuare sul repo attuale senza grandi cleanup.
2. **CLEANUP** — tenere il repo attuale ma ripulire architettura, naming, file legacy, routing e confini.
3. **REBUILD** — creare nuovo progetto pulito, copiando solo logica/asset utili.

Questa decisione deve essere basata sullo stato reale del repo, non su impressioni.

---

## 5. Regola principale

Non implementare nuove feature durante l'audit.

Prima devi produrre:

1. stato repo attuale;
2. livello di debito tecnico;
3. rischi del continuare;
4. costo stimato di cleanup;
5. costo stimato di rebuild;
6. raccomandazione KEEP / CLEANUP / REBUILD;
7. micro-piano operativo della strada scelta.

---

## 6. Scope V1 competitivo

La V1 competitiva deve coprire bene:

- QR menu cliente;
- ordine cliente;
- stato ordine cliente;
- staff dashboard;
- kitchen dashboard / KDS;
- pagamento al banco chiaro;
- menu availability / sold out;
- note e allergeni;
- storico ordini;
- report giornaliero base;
- UX professionale e brandizzata;
- deploy stabile;
- flusso comprensibile da gestore non tecnico.

---

## 7. V1.5 da NON implementare ora

Non implementare ora, salvo richiesta esplicita:

- Satispay;
- SumUp;
- Stripe;
- loyalty punti;
- reward;
- promo engine;
- quiz night;
- mission night;
- CRM;
- POS/cassa fiscale;
- RT/corrispettivi;
- magazzino avanzato.

Queste sono roadmap V1.5/V2/V3, non lo sprint di decisione.

---

## 8. File e aree da trattare con cautela

Non modificare senza autorizzazione esplicita:

- `src/App.jsx`;
- `.env` e variabili ambiente;
- configurazione Supabase;
- auth/login staff;
- route già funzionanti;
- test Playwright esistenti;
- asset Walrus già approvati;
- TV/Jukebox se lo sprint riguarda Kitchen.

Durante audit puoi leggere file e fare comandi read-only.

---

## 9. Comandi consentiti in audit

Consentiti:

```bash
git status
git log --oneline -10
find . -maxdepth 3 -type f | sort
find src -maxdepth 4 -type f | sort
cat package.json
```

Consentiti solo se utili:

```bash
npm run build
npm test
npx playwright test
```

Vietati in audit:

```bash
git add
git commit
git reset
git checkout
rm -rf
npm install
```

---

## 10. Output richiesto a Claude

Rispondi con questa struttura:

```md
# Walbox Repo Decision Audit

## 1. Executive decision
KEEP / CLEANUP / REBUILD

## 2. Perché
Massimo 10 righe.

## 3. Stato attuale repo
- cosa funziona
- cosa è fragile
- cosa è sporco

## 4. Rischi
- rischio prodotto
- rischio tecnico
- rischio demo/client-grade

## 5. Matrice decisionale
Tabella con punteggi.

## 6. Strada consigliata
Microfasi operative.

## 7. Primo prompt operativo
Prompt breve da dare nella prossima sessione.

## 8. Stop conditions
Quando fermarsi e chiedere approvazione.
```

---

## 11. Tono operativo

Sii chirurgico.

Non fare teoria.

Non proporre refactor globali senza motivo.

Non inventare feature.

Non cambiare obiettivo: la priorità è decidere la base tecnica migliore per arrivare a V1 vendibile.
