# WALBOX_NEXT_30_DAYS_PRIORITY_PLAN.md

## 1. Scopo del file

Questo file definisce il piano operativo dei prossimi 30 giorni per **walbox-from-zero-v2**.

Serve a evitare dispersione dopo l’incontro con il Walrus.

Regola madre:

```text
Prima chiudiamo il Jukebox Poster.
Poi prepariamo Kitchen MVP.
Poi creiamo il ponte.
```

---

## 1.5 Nota di stato — 2026-07-03

Questo piano è stato scritto il 2026-06-15 assumendo l'ordine "Poster prima, Kitchen dopo". La realtà lo ha superato:

```text
Kitchen MVP è già completo e stabile (S1→S10d Supabase, Cleanup Sprint,
V1-Competitive-Gap, V1-P6 flusso banco/ritiro — chiuso il 2026-06-23).

Dal 2026-06-24 il lavoro è tornato sul Jukebox: integrazione Spotify reale
(playback reale, TV sync, auto-avanzamento coda a fine canzone naturale,
ricerca Spotify) in preparazione della "Walrus Shuffle Night" pilota.
```

Le Priorità 1-2 (Jukebox Poster demo-ready, flusso stabilizzato) restano valide come obiettivo, ma vanno lette come "in corso ora con dati reali Spotify", non come step teorico prima di Kitchen. La Priorità 3 (piano Kitchen) è superata: Kitchen esiste già.

Vedi `CHECKPOINT.md` per lo stato aggiornato e il prossimo sprint (piano `walbox-dev` da `docs/PILOT_NIGHT_CHECKLIST.md`).

---

## 2. Contesto attuale

La V2 è il progetto corretto:

```text
walbox-from-zero-v2
```

La V2 è più snella e pulita del vecchio progetto Walrus Social Jukebox.

Priorità confermata dal cliente:

1. chiudere jukebox digitale versione poster;
2. renderlo attivabile per una serata;
3. preparare Kitchen MVP per menu/ordini da QR;
4. chiamare il cliente quando l’ordine è pronto;
5. costruire in futuro punti, promo, eventi, merch e gestionale.

---

## 3. Obiettivo dei prossimi 30 giorni

Entro 30 giorni Walbox deve avere:

```text
1. Jukebox Poster demo-ready;
2. flusso cliente → staff → TV verificato;
3. piano tecnico Kitchen MVP separato;
4. primo scheletro Kitchen solo se il Poster è stabile;
5. nessuna contaminazione tra Jukebox e Kitchen.
```

---

## 4. Cosa NON fare nei prossimi 30 giorni

Non costruire ora:

- loyalty completa;
- profilo avanzato;
- e-commerce merch;
- prenotazioni sito;
- notifiche email/app complesse;
- inventario;
- gestione bar/ristorante completa;
- social contest completo;
- Fantacalcio/Fantasanremo;
- Bridge Core condiviso prima del tempo.

Queste cose restano nella visione 12 mesi.

---

## 5. Priorità 1 — Chiudere Jukebox Poster

### Obiettivo

Rendere `/tv-poster` il più possibile demo-ready, vicino alla reference visuale approvata.

### File principale

```text
src/pages/LiveTvScreenWalrusPoster.jsx
```

### File da leggere solo se necessario

```text
src/data/mockData.js
src/pages/StaffDashboard.jsx
src/App.jsx
public/assets/tv-poster/
public/live_tv_visual_refs/walrus-poster-live-tv-reference.png
```

### Regola

```text
Modificare un solo file per micro-task.
Non toccare App.jsx, mockData.js o StaffDashboard.jsx senza piano approvato.
```

### Criteri demo-ready

Il Poster è demo-ready quando:

- si apre correttamente su `/tv-poster`;
- è leggibile a schermo TV/desktop;
- il layout non si rompe a zoom 100%;
- QR è visibile;
- titolo/artista/cover sono leggibili;
- coda prossimi brani è visibile;
- ticker/dediche funzionano o hanno fallback credibili;
- nessun asset ha sfondo bianco/scacchiera indesiderato;
- l’atmosfera è Walrus/poster/grunge;
- build passa.

---

## 6. Micro-task Jukebox Poster

Ordine consigliato:

### Task 1 — Visual gap review

Scopo:

```text
capire cosa manca rispetto alla reference.
```

Prompt:

```text
Analizza solo src/pages/LiveTvScreenWalrusPoster.jsx e la reference:
public/live_tv_visual_refs/walrus-poster-live-tv-reference.png

Non modificare codice.

Dimmi:
1. cosa è già simile alla reference;
2. cosa è più lontano;
3. quali asset esistenti posso usare;
4. quali parti devono restare dinamiche;
5. massimo 5 micro-task ordinati;
6. quale micro-task fare per primo su un solo file.
```

---

### Task 2 — Fix layout principale

Scopo:

```text
rendere la griglia poster più simile alla reference.
```

Regola:

```text
modificare solo LiveTvScreenWalrusPoster.jsx.
```

---

### Task 3 — Fix colonna destra

Scopo:

```text
QR, birra/Krombacher, prossimi in coda più simili alla reference.
```

Regola:

```text
modificare solo LiveTvScreenWalrusPoster.jsx.
```

---

### Task 4 — Fix ticker/footer

Scopo:

```text
dediche/ticker/footer più leggibili e più Walrus.
```

Regola:

```text
modificare solo LiveTvScreenWalrusPoster.jsx.
```

---

### Task 5 — Fallback demo

Scopo:

```text
evitare aree vuote durante la demo.
```

Regola:

```text
non cambiare struttura dati globale, solo fallback locali se possibile.
```

---

### Task 6 — Build/test finale

Comandi:

```bash
git status
git diff --stat
npm run build
npm run dev
```

Test manuale:

```text
/tv-poster
/staff
/request
/entry
```

---

## 7. Priorità 2 — Stabilizzare flusso Jukebox

Solo dopo il Poster.

### Obiettivo

Verificare flusso:

```text
Customer Entry
→ Customer Request
→ Staff Dashboard
→ Live TV Poster
```

### Cose da controllare

- nickname;
- tavolo;
- richiesta canzone;
- mood/dedica;
- approvazione staff;
- aggiornamento TV;
- coda;
- fallback;
- cross-tab sync/localStorage.

### Regola

Non refactorare il flusso.  
Solo bugfix mirati.

---

## 8. Priorità 3 — Piano tecnico Kitchen MVP

Solo dopo Jukebox Poster stabile.

### Obiettivo

Definire Kitchen come modulo separato.

### Route consigliate

```text
/kitchen
/kitchen/status
/kitchen/staff
```

### File consigliati

```text
src/pages/CustomerKitchenMenu.jsx
src/pages/CustomerOrderStatus.jsx
src/pages/KitchenStaffDashboard.jsx
src/data/kitchenMockData.js
```

### Stati ordine

```text
received
preparing
ready
delivered
cancelled
```

### Regola fondamentale

```text
Non mettere Kitchen dentro src/data/mockData.js del Jukebox.
Creare kitchenMockData.js separato.
```

---

## 9. Kitchen MVP — Funzioni minime

La prima Kitchen MVP deve includere:

- menu demo panini/birre/patatine;
- combo promo;
- invio ordine;
- dashboard staff/cucina;
- stati ordine;
- popup cliente quando pronto;
- vibrazione con `navigator.vibrate()` se supportata;
- suono solo se permesso dal browser;
- niente pagamento;
- niente cassa;
- niente inventario reale.

Pitch tecnico:

```text
Telefono cliente = dischetto che vibra stile La Piadineria.
```

---

## 10. Ponte futuro Jukebox + Kitchen

Non costruire nei 30 giorni, ma progettare.

Ponte futuro:

- stesso tavolo;
- stesso nickname;
- punti per ordine;
- punti per richiesta jukebox;
- promo food/drink;
- TV screen che mostra promo e ordini pronti;
- profilo Walrus leggero.

Regola:

```text
il ponte arriva solo quando Jukebox e Kitchen funzionano separati.
```

---

## 11. Definition of Done — 30 giorni

Il ciclo 30 giorni è riuscito se:

```text
1. /tv-poster è presentabile;
2. il flusso Jukebox non è rotto;
3. Kitchen ha un piano tecnico separato;
4. se si inizia Kitchen, ha file e dati separati;
5. il repo resta pulito;
6. ogni modifica è committata in step piccoli;
7. non sono state aperte feature grandi a metà.
```

---

## 12. Prompt operativo per Claude — Read-only

```text
Leggi:

docs/walbox-strategy/WALBOX_NEXT_30_DAYS_PRIORITY_PLAN.md
docs/walbox-strategy/WALBOX_FULL_VISION_12_MONTHS.md

Poi ispeziona solo se necessario:

src/pages/LiveTvScreenWalrusPoster.jsx
src/data/mockData.js
src/pages/StaffDashboard.jsx
src/App.jsx

Non modificare codice.
Non creare file.
Non eseguire implementazioni.

Obiettivo:
dimmi il primo micro-task sicuro per portare /tv-poster a demo-ready.

Rispondi in italiano solo con:
1. stato attuale;
2. gap principali;
3. primo file da modificare;
4. prima modifica minima;
5. rischi;
6. comando git diff da fare dopo.
```

---

## 13. Prompt operativo per Claude — Implementazione micro-task

Usare solo dopo approvazione.

```text
Applica solo il micro-task approvato.

Modifica solo:
src/pages/LiveTvScreenWalrusPoster.jsx

Non modificare altri file.
Non cambiare routing.
Non cambiare mockData.
Non cambiare StaffDashboard.
Non aggiungere Kitchen.
Non fare refactor.

Obiettivo:
[descrivere micro-task preciso]

Alla fine dimmi:
1. file modificati;
2. cosa hai cambiato;
3. cosa devo controllare nella preview;
4. comando git diff consigliato.
```

---

## 14. Comandi dopo ogni modifica

```bash
git status
git diff --stat
git diff src/pages/LiveTvScreenWalrusPoster.jsx
npm run build
npm run dev
```

Aprire:

```bash
open http://localhost:5173/tv-poster
```

Se porta diversa, usare quella indicata da Vite.

---

## 15. Commit suggeriti

Per Poster:

```bash
git add src/pages/LiveTvScreenWalrusPoster.jsx
git commit -m "Refine Walbox poster TV layout"
```

Per fallback:

```bash
git add src/pages/LiveTvScreenWalrusPoster.jsx
git commit -m "Add Walbox poster demo fallbacks"
```

Per Kitchen plan docs:

```bash
git add docs/walbox-strategy/WALBOX_NEXT_30_DAYS_PRIORITY_PLAN.md
git commit -m "Add Walbox 30 day priority plan"
```

---

## 16. Stop conditions

Fermarsi se Claude/Antigravity:

- modifica più file senza richiesta;
- tocca App.jsx senza approvazione;
- modifica mockData.js per ragioni visive;
- crea Kitchen mentre stiamo chiudendo Poster;
- elimina varianti TV;
- usa reference come immagine piatta di sfondo;
- rompe zoom 100%;
- introduce asset con sfondo bianco/scacchiera;
- propone refactor globale;
- propone backend prima del tempo.

---

## 17. Decisione finale

Per i prossimi 30 giorni:

```text
Poster prima.
Kitchen dopo.
Bridge dopo ancora.
```

La vittoria non è “fare tutto”.

La vittoria è:

```text
mostrare al Walrus una Walbox viva, stabile e credibile.
```
