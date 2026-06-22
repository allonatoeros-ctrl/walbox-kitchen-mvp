# PROMPT — REBUILD VS CLEANUP AUDIT
> Da incollare a Claude / Antigravity nel repo attuale Walbox.  
> Modalità: READ-ONLY. NO CODE. NO IMPLEMENTATION.

---

## Prompt da usare

Leggi prima `00_CLAUDE_START_HERE.md` se presente in root.

Modalità obbligatoria: **READ-ONLY AUDIT**.

Non modificare file.
Non creare file.
Non fare commit.
Non implementare feature.

Obiettivo: decidere se per Walbox conviene:

1. continuare sul repo attuale (**KEEP**);
2. pulire il repo attuale (**CLEANUP**);
3. creare un nuovo progetto pulito (**REBUILD**).

Usa solo comandi read-only e lettura file strettamente necessaria.

---

## Contesto prodotto

Walbox non è solo QR menu / kitchen.

Walbox è destinato a diventare:

```text
Venue Experience OS per piccoli locali italiani
```

Ma la priorità immediata è:

```text
V1 competitivo Order/Kitchen vendibile
```

Non implementare payment, loyalty, quiz, CRM o POS/fiscale in questo audit.

---

## Cosa devi controllare

### A. Struttura repo

Controlla:

- struttura cartelle;
- file legacy o duplicati;
- pagine attive vs pagine morte;
- routing;
- naming coerente;
- asset inutili o sparsi;
- test presenti;
- documentazione/checkpoint presenti.

### B. Stato prodotto V1

Verifica se esistono e quanto sono stabili:

- customer QR menu;
- customer order status;
- staff dashboard;
- kitchen dashboard/KDS;
- menu availability;
- storico ordini;
- staff login/auth;
- Supabase integration;
- test Playwright;
- TV/live screen separato dal flusso kitchen.

### C. Debito tecnico

Valuta:

- componenti troppo grandi;
- logica duplicata;
- hook confusi;
- localStorage/Supabase mischiati senza confine;
- routing fragile;
- CSS troppo accoppiato;
- asset non ordinati;
- feature demo mischiate a feature reali.

### D. Rischio rebuild

Valuta cosa si perderebbe se si riparte da zero:

- logica funzionante;
- Supabase già integrato;
- auth;
- test;
- asset;
- UX già validata;
- tempo speso.

### E. Rischio cleanup

Valuta cosa succede se continuiamo sul repo attuale:

- complessità crescente;
- Claude confuso dal legacy;
- rischio rompere route/prod;
- lentezza di sviluppo;
- difficoltà di onboarding nuovo locale.

---

## Comandi consigliati

Usa solo ciò che serve:

```bash
git status
git log --oneline -12
find . -maxdepth 3 -type f | sort
find src -maxdepth 4 -type f | sort
cat package.json
```

Se utile e sicuro:

```bash
npm run build
npx playwright test
```

Non usare comandi distruttivi.

---

## Output richiesto

Produci una risposta con questa struttura esatta:

```md
# Walbox Rebuild vs Cleanup Audit

## 1. Decisione consigliata
KEEP / CLEANUP / REBUILD

## 2. Motivazione breve
Massimo 10 righe.

## 3. Stato repo attuale
### Funziona
### Fragile
### Sporco / legacy
### Mancante per V1 competitivo

## 4. Matrice decisionale
| Criterio | KEEP | CLEANUP | REBUILD | Note |
|---|---:|---:|---:|---|

Criteri obbligatori:
- velocità verso V1 vendibile;
- rischio regressioni;
- pulizia architetturale;
- perdita lavoro già fatto;
- facilità per Claude;
- facilità onboarding nuovi locali;
- stabilità demo/client-grade;
- scalabilità V1.5.

## 5. File o aree critiche osservate
Lista breve con path.

## 6. Raccomandazione operativa
Microfasi massimo 6.

## 7. Stop conditions
Quando fermarsi prima di toccare codice.

## 8. Primo prompt operativo successivo
Prompt breve e chirurgico.
```

---

## Regole finali

Non proporre nuove feature.
Non trasformare l'audit in roadmap lunga.
Non leggere tutto il repo se basta la struttura.
Non modificare `App.jsx` o Supabase.
Non fare cleanup automatico.

La decisione deve essere pratica: quale strada porta prima Walbox a una V1 vendibile?
