# WALBOX CLEANUP EXECUTION PACK
> Root project file for Claude / Antigravity  
> Mode: cleanup operativo, non rebuild  
> Stato: dopo Rebuild vs Cleanup Audit  

---

## Decisione accettata

**Decisione:** CLEANUP.

Il repo attuale non va rifatto da zero. Va ripulito e portato a V1 vendibile.

Motivo:

- Supabase Kitchen S1-S10d è già validato.
- Auth staff funziona.
- Customer flow e staff dashboard esistono.
- Playwright E2E esiste.
- Kitchen è già separata in hook, pagine e componenti.
- Un rebuild farebbe perdere lavoro stabile.

Il problema attuale non è architettura rotta. È rumore: root sporca, legacy Jukebox, confine Kitchen/Jukebox sfumato, S11 localStorage pendente, Kitchen TV senza route, report base mancante.

---

## Obiettivo Sprint Cleanup

Portare Walbox Kitchen a **V1 competitivo vendibile** senza riscrivere il progetto.

V1 competitivo significa:

- QR menu cliente funzionante;
- ordine cliente funzionante;
- stato ordine cliente chiaro;
- dashboard staff funzionante;
- KDS cucina leggibile;
- pagamento al banco chiaro;
- menu availability / sold out funzionante;
- storico ordini;
- report giornaliero base;
- Kitchen TV accessibile;
- deploy stabile;
- repo leggibile per Claude.

---

## Regola fondamentale

Non implementare V1.5 finché V1 non è chiusa.

Quindi per ora NON implementare:

- Satispay;
- SumUp;
- Stripe;
- loyalty;
- punti;
- promo engine;
- quiz;
- Mission Night;
- POS/fiscale;
- CRM;
- nuove tabelle Supabase non richieste.

---

## File protetti

### Protetti sempre

- `.env*`
- `package.json`
- `package-lock.json`
- configurazioni Vercel/Supabase salvo richiesta esplicita
- auth Supabase salvo task dedicato
- database schema / RLS salvo task dedicato

### Protetti con approvazione

- `src/App.jsx`
- `src/hooks/useKitchenOrders.js`
- `src/hooks/useKitchenMenu.js`
- `src/hooks/useCustomerSession.js`

### Non toccare durante cleanup Kitchen

- Jukebox flow, salvo commenti/namespacing in `App.jsx`
- Poster TV / Walrus TV legacy
- `StaffDashboard.jsx` Jukebox
- `mockData.js` Jukebox
- asset TV/Jukebox

---

## Stop conditions

Fermarsi e chiedere approvazione se:

1. una microfase richiede più file di quelli approvati;
2. una modifica tocca Supabase schema/RLS;
3. una modifica cambia fallback offline/localStorage invece di limitarsi al task;
4. una modifica elimina route Jukebox;
5. una modifica rompe demo TV/Poster;
6. una modifica richiede cambiare `package.json`;
7. una fase diventa refactor globale.

---

# Microfasi Cleanup

---

## CL-1 — Kitchen TV route

**Obiettivo:** rendere accessibile Kitchen TV.

**File approvato:**

- `src/App.jsx`

**Task:**

Aggiungere route:

```jsx
case "/kitchen/tv": return <KitchenTvScreen />;
```

**Vincoli:**

- non toccare altri case;
- non toccare imports se `KitchenTvScreen` è già importato;
- non toccare dev-nav;
- non toccare Jukebox routes;
- non fare refactor router.

**Validazione:**

```bash
git diff src/App.jsx
npm run build
```

---

### Prompt Claude CL-1

```md
Modalità: IMPLEMENTATION MICROPHASE — CL-1

File approvato: src/App.jsx

Task: aggiungere route `/kitchen/tv` nel switch renderRoute().
KitchenTvScreen dovrebbe essere già importato. Se è già importato, non toccare gli imports.
Aggiungere solo:

case "/kitchen/tv": return <KitchenTvScreen />;

Non toccare altri case.
Non toccare dev-nav bar.
Non fare refactor router.
Non toccare file diversi da src/App.jsx.

Dopo modifica esegui:
1. git diff src/App.jsx
2. npm run build

Output finale breve:
- cosa hai modificato;
- risultato build;
- eventuali rischi.
```

---

## CL-2 — S11 localStorage cleanup audit

**Obiettivo:** capire esattamente cosa rimuovere dal dual-write prima di modificare hook ordini.

**File da leggere:**

- `src/hooks/useKitchenOrders.js`
- eventuali test e2e Kitchen rilevanti

**Task:** read-only audit prima di implementare.

**Output richiesto:**

- punti in cui scrive ancora localStorage;
- cosa dipende da localStorage;
- cosa è sicuro rimuovere;
- cosa deve restare come cache/read-only;
- microfase implementativa proposta.

---

### Prompt Claude CL-2 Audit

```md
Modalità: READ-ONLY AUDIT — CL-2 S11 localStorage cleanup

File da leggere:
- src/hooks/useKitchenOrders.js
- test e2e Kitchen solo se necessario

Non modificare file.
Non implementare.

Obiettivo: identificare il debito S11 localStorage/Supabase dual-write.

Output richiesto:
1. dove useKitchenOrders.js legge localStorage;
2. dove useKitchenOrders.js scrive localStorage;
3. quali scritture sono legacy e rimuovibili;
4. quali parti servono ancora come fallback/cache;
5. rischio cross-device;
6. microfase implementativa consigliata con file esatti.
```

---

## CL-3 — Root doc cleanup

**Obiettivo:** rendere la root leggibile per Claude.

**Task:** spostare documentazione storica in cartella archivio senza toccare codice.

**Cartella consigliata:**

```txt
_docs/archive/
```

**File candidati:**

- `CHECKPOINT_*`
- `SESSION_*`
- `BUILD_PLAN*`
- `WALBOX_V2_*`
- file numerati `00_*` → `27_*` se sono documentazione storica
- prompt temporanei già usati

**Lasciare in root:**

- `README.md`
- `CHECKPOINT.md`
- `CLAUDE.md` se presente
- `package.json`
- config Vite/Playwright/Vercel/Supabase
- `.env.example` se presente

---

### Prompt Claude CL-3 Audit

```md
Modalità: READ-ONLY AUDIT — CL-3 Root doc cleanup

Non modificare file.
Non spostare file.

Obiettivo: proporre quali file documentali in root possono essere archiviati in `_docs/archive/` senza toccare codice.

Output richiesto:
1. file da lasciare in root;
2. file candidati da archiviare;
3. file dubbi da non toccare senza approvazione;
4. comando `mkdir`/`mv` proposto, ma non eseguito.
```

---

## CL-4 — Namespacing Jukebox vs Kitchen in App.jsx

**Obiettivo:** ridurre confusione senza eliminare vecchie route.

**File approvato:**

- `src/App.jsx`

**Task:** aggiungere commenti chiari nelle sezioni route:

```jsx
// === JUKEBOX MODULE ROUTES ===
// === KITCHEN MODULE ROUTES ===
// === TV / POSTER ROUTES ===
```

**Vincoli:**

- non eliminare route;
- non rinominare route;
- non cambiare logica router;
- non toccare componenti.

---

### Prompt Claude CL-4

```md
Modalità: IMPLEMENTATION MICROPHASE — CL-4 App routing namespacing

File approvato: src/App.jsx

Task: aggiungere solo commenti di separazione nel routing switch/renderRoute per distinguere:
- JUKEBOX MODULE ROUTES
- KITCHEN MODULE ROUTES
- TV / POSTER ROUTES
- DEV / FALLBACK ROUTES se presenti

Non eliminare route.
Non rinominare route.
Non cambiare logica.
Non toccare altri file.

Dopo modifica:
1. git diff src/App.jsx
2. npm run build

Output finale breve.
```

---

## CL-5 — Report giornaliero base

**Obiettivo:** aggiungere valore gestore V1 senza dashboard enterprise.

**Prima fase:** audit, non implementazione.

**Possibile scope V1:**

- ordini oggi;
- incasso stimato/confermato oggi;
- valore medio ordine;
- prodotti top;
- pagati / da pagare;
- cancellati;
- export non obbligatorio in prima microfase.

**Da evitare:**

- nuove tabelle Supabase;
- BI complessa;
- grafici pesanti;
- loyalty/payment provider;
- fiscalità.

---

### Prompt Claude CL-5 Audit

```md
Modalità: READ-ONLY AUDIT — CL-5 Report giornaliero base

Non implementare.
Non creare componenti.

Leggi solo i file necessari per capire:
- KitchenStaffDashboard.jsx
- StoricoView.jsx
- useKitchenOrders.js
- eventuali tipi/shape ordine in data/hook

Obiettivo: proporre il modo più piccolo e sicuro per aggiungere un REPORT giornaliero base alla Staff Dashboard Kitchen.

Output richiesto:
1. dati già disponibili sugli ordini;
2. KPI calcolabili senza nuove tabelle;
3. file da modificare;
4. rischio UI;
5. microfasi implementative;
6. primo prompt implementativo.
```

---

## CL-6 — QA V1 deploy

**Obiettivo:** validare che cleanup non abbia rotto V1.

**Checklist minima:**

```bash
npm run build
npx playwright test
```

**Verifiche manuali:**

- `/kitchen`
- `/kitchen/status` o route equivalente status cliente
- `/kitchen/staff` o dashboard staff attuale
- `/kitchen/login`
- `/kitchen/tv`

**Output atteso:**

- build pass/fail;
- test pass/fail;
- route verificate;
- regressioni;
- prossimo blocco V1.

---

## Sequenza consigliata

1. CL-1 — route Kitchen TV.
2. CL-2 audit — S11 localStorage cleanup.
3. CL-2 implementazione solo dopo audit.
4. CL-3 audit root cleanup.
5. CL-3 esecuzione spostamenti dopo approvazione.
6. CL-4 namespacing App.jsx.
7. CL-5 audit Report giornaliero.
8. CL-5 implementazione in microfasi.
9. CL-6 QA V1 deploy.

---

## Stato finale desiderato

Alla fine del cleanup il repo deve essere:

- non rebuildato;
- più leggibile per Claude;
- Kitchen separata mentalmente dal Jukebox;
- S11 localStorage risolto o pianificato con precisione;
- Kitchen TV raggiungibile;
- Report giornaliero base pianificato o implementato;
- V1 più vicina a vendita reale.

