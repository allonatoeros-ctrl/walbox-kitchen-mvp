# WALBOX_FULL_VISION_12_MONTHS.md

## 1. Scopo del file

Questo file definisce la visione completa a 12 mesi di **Walbox / Walrus OS** dopo l’incontro con il Walrus.

Serve a non perdere la visione totale mentre si lavora sulle priorità immediate.

Regola principale:

```text
Priorità operative ora:
1. chiudere Jukebox Poster;
2. rendere attivabile il Jukebox per una serata;
3. progettare Kitchen MVP separata.

Visione 12 mesi:
costruire progressivamente un sistema digitale Walrus che unisce jukebox, menu, cucina, promo, punti, eventi, merch, sito, prenotazioni e social experience.
```

---

## 2. Contesto

Walbox nasce come social jukebox:

- QR al tavolo;
- nickname/tavolo;
- scelta canzone;
- mood/reaction;
- dedica;
- dashboard staff;
- Live TV Screen;
- classifiche, momenti social, atmosfera da locale.

Dopo l’incontro con il Walrus, la direzione si è allargata.

Il cliente ha espresso bisogni reali legati a:

- cucina panini in apertura;
- impossibilità/limite del servizio al tavolo;
- necessità di chiamare il cliente quando l’ordine è pronto;
- menu digitale;
- promozioni food/drink;
- tessera punti;
- eventi;
- merchandising;
- sito/prenotazioni;
- contest social;
- gestionale leggero.

Questa non è una deviazione: è l’evoluzione naturale di Walbox.

---

## 3. Posizionamento finale

Walbox non deve essere presentata solo come “jukebox”.

Walbox deve diventare:

```text
il sistema digitale interattivo del Walrus.
```

Frase di posizionamento:

> Walbox trasforma il Walrus in una social experience operativa: il cliente entra da QR, partecipa, ordina, viene chiamato quando è pronto, accumula punti, scopre promo, gioca con il locale e genera contenuti social.

Versione breve:

> Jukebox + Kitchen + Punti + Promo + Eventi + Social = Walbox.

---

## 4. Architettura prodotto

### 4.1 WALBOX JUKEBOX

Scopo:

```text
creare effetto wow e social experience durante la serata.
```

Include:

- QR cliente;
- richiesta canzone;
- mood;
- dedica;
- staff dashboard;
- Live TV Screen;
- Poster TV;
- classifiche;
- contenuti social.

Priorità:

```text
chiudere Jukebox Poster e renderlo demo-ready.
```

---

### 4.2 WALBOX KITCHEN

Scopo:

```text
risolvere il problema operativo della cucina panini.
```

Include:

- QR tavolo;
- menu digitale;
- ordine cliente;
- dashboard staff/cucina;
- stati ordine;
- chiamata cliente quando pronto;
- popup/suono/vibrazione su telefono;
- combo promo panino + birra + patatine.

Stati ordine:

```text
Ricevuto
In preparazione
Pronto
Consegnato
Annullato
```

Pitch semplice:

> Invece del dischetto che vibra stile La Piadineria, il cliente viene chiamato dal telefono.

---

### 4.3 WALBOX CORE

Scopo:

```text
collegare Jukebox e Kitchen senza fonderli subito.
```

Include:

- tavolo;
- nickname;
- profilo leggero;
- punti;
- promo;
- storico leggero;
- preferenze;
- badge;
- premi.

Regola:

```text
Core non va costruito prima che Jukebox e Kitchen siano stabili come moduli separati.
```

---

### 4.4 WALBOX LOYALTY

Scopo:

```text
far tornare le persone e dare valore a food, drink, merch ed eventi.
```

Include:

- tessera punti;
- livelli Tricheco;
- badge;
- premi;
- coupon;
- promo personalizzate;
- punti per ordini, jukebox, eventi, social contest e merch.

Livelli possibili:

```text
Cucciolo di Tricheco
Tricheco da Banco
Tricheco Affamato
Tricheco Leggendario
Always The Fucking Walrus
```

---

### 4.5 WALBOX PROMO ENGINE

Scopo:

```text
gestire offerte e spinte commerciali.
```

Include:

- combo panino + birra + patatine;
- cocktail del giorno;
- cocktail del mese;
- promo merch;
- promo evento;
- promo stock/inventario;
- premi punti.

Esempio:

```text
Combo Porcheria Seria
Panino + birra + patatine
Da X a Y
Valida fino al 31/12
+30 punti Tricheco
```

---

### 4.6 WALBOX EVENTS

Scopo:

```text
rendere il locale più vivo e programmabile.
```

Include:

- quizzone;
- Fantacalcio;
- Fantasanremo;
- serate a tema;
- nuove aperture;
- nuovi panini;
- nuovi cocktail;
- classifiche;
- premi;
- comunicazione su TV/app/mail.

---

### 4.7 WALBOX MERCH

Scopo:

```text
rendere il merchandising parte dell’esperienza.
```

Include:

- catalogo merch;
- promo;
- premi punti;
- stock manuale;
- promo automatiche future in base all’inventario;
- vendita online futura.

Regola:

```text
prima showcase e promo manuali; e-commerce completo solo dopo.
```

---

### 4.8 WALBOX SOCIAL

Scopo:

```text
trasformare i clienti in contenuti e contenuti in engagement.
```

Include:

- contest Instagram;
- post/storia più figa;
- tag Walrus;
- premio collegato a punti;
- TV screen con finalisti;
- classifiche social;
- materiale per social media manager.

Regola:

```text
Walbox non sostituisce il social media manager: gli crea contenuti vivi.
```

---

### 4.9 WALBOX WEBSITE / BOOKING

Scopo:

```text
portare Walbox fuori dal locale.
```

Include:

- sito rifatto;
- pagina menu;
- prenotazioni base;
- eventi;
- merch online;
- newsletter/notifiche;
- promo pubbliche.

Regola:

```text
non prima di aver chiuso Jukebox e Kitchen MVP.
```

---

## 5. Priorità a 12 mesi

> **Nota di stato — 2026-07-03:** l'ordine reale è stato invertito rispetto al piano. Kitchen (Mese 3-4: menu digitale, ordini Supabase, staff dashboard cucina, flusso banco/ritiro) è già **completo e stabile** dal 2026-06-23 (S1→S10d, V1-Competitive-Gap, V1-P6). Il Jukebox (Mese 1-2) è invece **in corso ora** (24/6→3/7): integrazione Spotify reale, auto-avanzamento coda, TV sync, in preparazione della Shuffle Night pilota. Vedi `CHECKPOINT.md` per lo stato aggiornato.

### Mese 1 — Jukebox Poster demo-ready

Obiettivo:

```text
chiudere la versione poster del jukebox digitale.
```

Output:

- `/tv-poster` stabile;
- visual più vicino alla reference;
- QR chiaro;
- coda visibile;
- dediche/mood/ticker leggibili;
- staff dashboard funzionante;
- test locale/browser;
- build pulita.

---

### Mese 2 — Jukebox attivabile + piano Kitchen

Obiettivo:

```text
rendere Jukebox attivabile per una Shuffle Night e progettare Kitchen.
```

Output:

- flusso cliente → staff → TV testato;
- istruzioni serata;
- fallback demo;
- piano tecnico Kitchen;
- route Kitchen decise;
- dati Kitchen separati dal Jukebox.

---

### Mese 3 — Kitchen MVP demo

Obiettivo:

```text
creare primo modulo Kitchen separato.
```

Output:

- menu digitale demo;
- ordini localStorage/demo;
- staff dashboard cucina;
- stati ordine;
- popup cliente quando pronto;
- vibrazione/suono se browser lo consente.

---

### Mese 4 — Kitchen più reale

Obiettivo:

```text
rendere Kitchen più usabile in contesto locale.
```

Output:

- categorie menu;
- combo promo;
- gestione note ordine;
- timer/ordine in attesa;
- vista staff più chiara;
- test da telefono.

---

### Mese 5 — Primo ponte Jukebox + Kitchen

Obiettivo:

```text
collegare tavolo, nickname e punti demo.
```

Output:

- profilo leggero;
- punti finti/semi-reali;
- punti per ordine;
- punti per richiesta jukebox;
- promo sbloccata.

---

### Mese 6 — Promo + drink/cocktail

Obiettivo:

```text
aggiungere promo food/drink.
```

Output:

- cocktail del giorno;
- cocktail del mese;
- drink list;
- descrizione birre/cocktail;
- combo panino+birra+patatine;
- promo staff-managed.

---

### Mese 7 — Eventi

Obiettivo:

```text
attivare eventi e format Walrus.
```

Output:

- quizzone;
- Fantacalcio;
- Fantasanremo;
- calendario eventi;
- premio collegato ai punti;
- TV/event screen.

---

### Mese 8 — Merchandising

Obiettivo:

```text
integrare merch in app.
```

Output:

- catalogo merch;
- promo merch;
- premi punti;
- stock manuale demo;
- CTA acquisto/richiesta.

---

### Mese 9 — Social contest

Obiettivo:

```text
trasformare tag/post/storie in engagement.
```

Output:

- contest social;
- premio;
- classifica o selezione staff;
- TV screen dedicata;
- materiale per SMM.

---

### Mese 10 — Sito e prenotazioni base

Obiettivo:

```text
costruire presenza esterna.
```

Output:

- landing Walrus/Walbox;
- menu online;
- eventi;
- prenotazioni base;
- link app/QR.

---

### Mese 11 — Gestionale leggero

Obiettivo:

```text
rafforzare strumenti staff.
```

Output:

- dashboard più ordinata;
- promo manager base;
- eventi manager base;
- merch manager base;
- report leggero.

---

### Mese 12 — Consolidamento e pacchetto rivendibile

Obiettivo:

```text
stabilizzare Walbox come caso studio e prodotto riutilizzabile.
```

Output:

- polish UX;
- test reali;
- bugfix;
- documentazione;
- pitch finale;
- pacchetto demo per altri locali.

---

## 6. Cosa NON fare subito

Non costruire subito:

- pagamento online;
- app nativa iOS/Android;
- e-commerce completo;
- inventario automatico;
- integrazione cassa fiscale;
- stampanti cucina;
- CRM complesso;
- prenotazioni avanzate;
- gestione privacy avanzata;
- matching sociale/dating;
- automazioni email complesse;
- ponte Core troppo presto.

Regola:

```text
prima moduli separati funzionanti, poi ponte, poi prodotto completo.
```

---

## 7. Priorità assoluta

Da oggi:

```text
1. chiudere Jukebox Poster;
2. non rompere la V2;
3. non aprire Kitchen finché Poster non è demo-ready;
4. creare Kitchen separata;
5. collegare dopo tramite tavolo/profilo/punti/promo.
```

---

## 8. Principio operativo

Walbox va costruita così:

```text
modulo → test → commit → demo → feedback → prossimo modulo
```

Non così:

```text
tutto insieme → caos → niente demo pronta
```

---

## 9. Prompt di riferimento per Claude/Antigravity

```text
Leggi WALBOX_FULL_VISION_12_MONTHS.md e WALBOX_NEXT_30_DAYS_PRIORITY_PLAN.md.

Non modificare codice.

Obiettivo:
capire la visione completa Walbox e rispettare la priorità immediata.

Regole:
- Jukebox Poster viene prima della Kitchen.
- Kitchen va progettata separata.
- Core/points/promo sono ponte futuro.
- Non modificare più file senza richiesta.
- Non toccare moduli esistenti non coinvolti.
- Prima piano, poi approvazione, poi implementazione.
```

---

## 10. Decisione finale

Questo file è la visione annuale.

Il file operativo da usare ogni giorno è:

```text
WALBOX_NEXT_30_DAYS_PRIORITY_PLAN.md
```
