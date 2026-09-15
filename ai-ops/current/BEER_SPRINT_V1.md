# WALBOX KITCHEN — BEER SPRINT V1

**Status:** Missione attiva  
**Obiettivo:** trasformare la sezione Birre da catalogo passivo a sistema di vendita guidata, senza introdurre complessità inutile.

---

## 1. PRINCIPIO PRODOTTO

Walbox non deve limitarsi a mostrare birre.

Deve aiutare il cliente a:
1. capire rapidamente cosa scegliere;
2. vedere solo prodotti realmente disponibili;
3. ricevere suggerimenti contestuali coerenti con il cibo;
4. ridurre il tempo decisionale;
5. aumentare attach rate e valore medio ordine.

Principio guida:

> **“App che vende da sola” = scelta semplice + suggerimento contestuale + misurazione reale.**

Niente motore AI nella V1. Prima regole semplici, controllabili e misurabili.

---

## 2. DATI CONFERMATI

### Birre in bottiglia

| Prodotto | Formato | Prezzo | Stato |
|---|---:|---:|---|
| Keiler Dunkel Weisse | 50 cl | €6 | confermato |
| Keiler Helles | 50 cl | €6 | confermato |
| Keiler Kellerbier | 50 cl | €6 | confermato |
| Keiler Land-Pils | 50 cl | €6 | confermato |
| Keiler Weisse | 50 cl | €6 | confermato |
| Lupulus | 33 cl | €6 | confermato |

### Birra alla spina

**Krombacher Pils**
- disponibile **solo la sera**;
- può entrare nelle combo previste la sera;
- formato: **da confermare**;
- prezzo standalone: **da confermare**.

Non inventare dati mancanti.

---

## 3. DECISIONI DI PRODOTTO GIÀ PRESE

### Choice architecture

Ogni birra deve avere una personalità immediata e comprensibile.

- **Keiler Helles** → `VAI SUL SICURO`
- **Keiler Land-Pils** → `PIÙ SECCA`
- **Keiler Kellerbier** → `NON FILTRATA`
- **Keiler Weisse** → `FRUTTATA`
- **Keiler Dunkel Weisse** → `SCURA & CORPOSA`
- **Lupulus** → `INTENSA`

La UI deve evitare descrizioni tecniche lunghe.  
Scopo: far pensare al cliente “questa è quella per me”.

### Regola Krombacher

Krombacher non è un semplice item sempre disponibile.

Modello minimo:

```txt
availability:
  all_day
  evening_only
```

- 6 bottiglie → `all_day`
- Krombacher → `evening_only`

A pranzo non va mostrata come scelta acquistabile.
La regola deve essere dati/configurazione, non un hack visuale hardcoded.

### FALLO COMBO

**SUPERATO. NON REINTRODURRE.**

Nel prodotto corrente esistono le **combo normali già implementate**.

Qualsiasi vecchio riferimento a `FALLO COMBO` è source drift e non deve guidare nuove implementazioni.

---

## 4. EXPERIENCE TARGET

### Card chiusa

La card deve permettere una scelta veloce con:

- immagine prodotto;
- nome;
- etichetta di scelta;
- massimo 2 segnali di gusto;
- formato;
- prezzo;
- CTA add.

Esempio concettuale:

```txt
KEILER HELLES
VAI SUL SICURO

Morbida · fresca

50 CL               €6
                     +
```

### Expanded state

Il dettaglio può aggiungere:

- una micro-descrizione;
- 2–3 attributi di gusto;
- eventuale pairing;
- CTA principale.

Niente wall-text.

### Helper di scelta

Valutare una scorciatoia semplice per chi non conosce le birre:

```txt
NON SAI QUALE?

VAI SUL SICURO → Helles
LA VUOI FRUTTATA → Weisse
LA VUOI INTENSA → Lupulus
```

Implementare solo se coerente con la UI corrente e non crea rumore.

---

## 5. AUTO-SELLING V1

Non costruire un recommendation engine.

Usare una matrice semplice e configurabile:

```txt
food/category/item → recommended_beer
```

Principio:

> **1 contesto → 1 suggerimento principale**

Non mostrare 5 alternative durante il cross-sell.

Direzione iniziale da validare nel codice/prodotto:

- panini standard → Helles;
- prodotti più grassi/intensi → Land-Pils;
- Pesi Massimi → Lupulus;
- salumi/taglieri → Kellerbier;
- piatti più freschi → Weisse.

Questi pairing sono una **ipotesi prodotto iniziale**, non verità immutabile.
Devono poter essere cambiati sulla base dei dati.

---

## 6. ASSET SYSTEM

Obiettivo: famiglia visuale coerente.

Per le bottiglie:

- stessa prospettiva;
- stessa altezza apparente;
- crop coerente;
- etichetta leggibile;
- sfondo trasparente o trattamento coerente;
- niente decorazioni casuali diverse per ogni card.

Krombacher alla spina può avere un trattamento distinto perché è un’esperienza diversa.

Non creare asset finali se mancano riferimenti affidabili del prodotto reale.

---

# 7. SPRINT OPERATIVO

## A0 — AUDIT READ-ONLY

Prima di modificare codice:

Audit mirato di:
- catalogo/menu corrente;
- struttura dati birre/bevande;
- componenti card/item;
- combo reali esistenti;
- disponibilità / availability attuale;
- analytics già presenti;
- punti possibili per cross-sell.

### Regole audit

- NO fork.
- NO subagent.
- partire dai file correnti, non da vecchi report;
- budget iniziale: massimo 6–8 file mirati;
- aprire storico/migration solo se realmente necessario;
- evitare ricostruzioni teoriche del dominio;
- report corto e basato su evidenza.

### Output A0

```txt
CURRENT_STATE
FILES_READ
WHAT_ALREADY_EXISTS
GAPS
RISKS
RECOMMENDED_IMPLEMENTATION_PATH
ASSUMPTIONS_CONFIRMED_OR_REJECTED
```

### STOP obbligatorio

Se l’audit smentisce una decisione importante di questa missione:
**STOP e segnala il conflitto prima di implementare.**

---

## A — PRODUCT / DATA

Implementare il modello minimo necessario per:

- 6 bottiglie confermate;
- formato;
- prezzo;
- choice label;
- availability;
- Krombacher `evening_only`.

Niente over-engineering.

Se per farlo servono DB/migration → STOP e chiedere approvazione.

---

## B — BIRRE UI

Costruire/adattare:

- card;
- expanded state se coerente col pattern corrente;
- choice architecture;
- mobile-first;
- CTA coerente col menu attuale.

Non creare un design parallelo al resto di Kitchen.

---

## C — ASSET

Integrare asset coerenti.

Se gli asset reali non sono disponibili:
- usare placeholder espliciti o fermarsi;
- non generare immagini fake di prodotto senza approvazione.

---

## D — AUTO-SELLING

Aggiungere il primo layer di pairing:

- semplice;
- configurabile;
- 1 suggerimento per contesto;
- nessun motore AI;
- nessun comportamento aggressivo.

Non modificare il checkout o logiche economiche senza necessità.

---

## E — COMBO ESISTENTI + SERVICE RULES

Auditare e usare **solo le combo reali correnti**.

Obiettivi:

- integrare le birre dove ha senso;
- permettere Krombacher solo quando il servizio serale è attivo;
- non reintrodurre vecchi sistemi `FALLO COMBO`;
- non inventare logiche prezzo.

Se emergono regole commerciali mancanti → STOP / HUMAN INPUT.

---

## F — ANALYTICS

Misurare almeno:

```txt
beer_view
beer_expand
beer_add
beer_choice_helper_click
beer_pairing_impression
beer_pairing_accept
```

Riutilizzare il sistema analytics esistente se presente.

Non duplicare infrastruttura già disponibile.

---

# 8. SESSION OPERATING MODEL

Questa missione deve ridurre al minimo il copia/incolla tra ChatGPT e Claude.

## Memoria persistente

La fonte primaria della missione è questo file.

Claude deve mantenere un piccolo checkpoint operativo aggiornato dopo ogni fase con:

```txt
CURRENT_PHASE
COMPLETED
FILES_CHANGED
TESTS_RUN
DECISIONS_CONFIRMED
OPEN_INPUTS
NEXT_STEP
```

## Sessioni

Restare nella stessa sessione Claude quando:
- si sta lavorando sulla stessa root cause/fase;
- implementazione → test → fix → retest;
- il contesto è ancora sano.

Usare `/clear` quando:
- A0 audit è concluso e si passa al build;
- cambia realmente obiettivo;
- la sessione è contaminata o troppo grande.

Dopo `/clear` non serve reincollare tutto.

Riprendere leggendo:
1. questo file;
2. checkpoint corrente;
3. solo i file necessari alla fase.

Comando di ripresa desiderato:

```txt
Continua BEER_SPRINT_V1 dal checkpoint corrente.
```

---

# 9. AUTONOMIA E STOP GATES

Claude può procedere autonomamente nelle fasi locali e scoped se:

- audit coerente con missione;
- nessuna modifica critica;
- nessun rischio economico / auth / DB;
- test locali disponibili.

### HUMAN APPROVAL OBBLIGATORIA per:

- DB / migration / Supabase mutation;
- auth / RLS / security;
- env / secrets;
- git push;
- deploy;
- delete / cleanup irreversibile;
- cambio prezzi o regole commerciali non confermate;
- modifica di logiche pagamento;
- refactor rischioso;
- introduzione di nuove dipendenze importanti;
- azioni esterne.

### STOP anche se:

- il codice corrente contraddice la missione;
- mancano dati reali;
- la soluzione richiede uno scope molto più grande;
- una fase supera chiaramente il problema che sta risolvendo.

---

# 10. DEFINITION OF DONE — BEER SPRINT V1

La V1 è chiusa quando:

- 6 bottiglie corrette sono nel catalogo;
- formato e prezzo sono corretti;
- Krombacher è modellata come `evening_only`;
- UI mobile è coerente e leggibile;
- choice architecture è visibile senza sovraccarico;
- almeno un percorso di auto-selling è operativo;
- combo correnti non sono state rotte;
- analytics minimi sono attivi;
- build/test rilevanti passano;
- nessun vecchio `FALLO COMBO` viene reintrodotto;
- checkpoint finale indica chiaramente cosa è LIVE, cosa è locale e cosa resta HUMAN INPUT.

---

## OPEN INPUTS

1. Krombacher Pils — formato standalone.
2. Krombacher Pils — prezzo standalone.
3. Eventuali asset reali mancanti.
4. Eventuali regole commerciali specifiche delle combo che emergono dall’audit.

---

## FIRST ACTION

**Eseguire A0 — AUDIT READ-ONLY.**

Nessun build prima che A0 confermi che la missione è compatibile con il codice corrente.
