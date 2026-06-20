---
name: weekly-report
description: Genera un report settimanale sull'avanzamento di Walbox per i proprietari del pub, in italiano non tecnico, salvato come file pronto per essere inviato via email.
---

# Weekly Report — Walbox

## Quando usare

Invoca con `/weekly-report` a fine settimana o dopo un blocco di lavoro significativo.
Nessun parametro richiesto.

---

## Obiettivo

Produrre un report leggibile dai proprietari del pub (non tecnici) che spieghi:
- cosa è stato fatto questa settimana
- come funziona, in parole semplici
- a che punto siamo rispetto al piano totale
- cosa succederà la prossima settimana

---

## Regole di economia — RISPETTARE SEMPRE

- **Non leggere file sorgente.** Zero `cat`, zero `Read` su `.jsx/.ts/.css`.
- **Non aprire il codebase.** Non serve per questo report.
- **Fonti consentite — solo queste due:**
  1. `git log --oneline --since="8 days ago"` → cosa è cambiato davvero
  2. File di memoria già caricati in contesto (MEMORY.md + file collegati) → stato fasi e piano
- Se la memoria non è aggiornata, usare il git log come fonte primaria e dichiararlo nel report.

---

## Step by step

### Step 1 — Recupera i commit recenti

Esegui:
```bash
git log --oneline --since="8 days ago"
```

Se non ci sono commit nell'ultima settimana, allarga a 14 giorni:
```bash
git log --oneline --since="14 days ago"
```

Non leggere i diff. Solo i messaggi dei commit.

### Step 2 — Leggi lo stato dal contesto

Usa i file di memoria già caricati in contesto:
- `MEMORY.md` → indice generale
- `project_kitchen_current_state.md` → stato implementato
- `project_kitchen_phase_plan.md` → fasi e roadmap
- `project_kitchen_remaining_phases.md` → fasi rimanenti

Non aprire altri file. Se un file non è in contesto, salta e usa quello che hai.

### Step 3 — Calcola l'avanzamento

Stima la percentuale di completamento basandoti sulle fasi:
- Conta le fasi completate vs totali dalla memoria
- Esprimi con una barra visiva semplice tipo: `▓▓▓▓▓░░░░░ 50%`
- Se non hai dati precisi, usa una stima ragionata e dichiarala

### Step 4 — Scrivi il report

Scrivi in italiano, tono diretto e caldo. Niente gergo tecnico.
Non usare parole come: API, hook, component, database, deploy, branch, commit, JSX, Supabase.
Usa invece: schermata, sezione, funzionalità, pannello, sistema, aggiornamento, miglioria.

**Struttura obbligatoria:**

```
Oggetto: Walbox — Aggiornamento [settimana del GG/MM/AAAA]

Ciao,

QUESTA SETTIMANA
[2-4 bullet. Cosa abbiamo costruito o migliorato. Una riga per punto, linguaggio semplice.]

COME FUNZIONA ADESSO
[1-3 paragrafi brevi. Spiega le funzionalità nuove come se le descrivessi a qualcuno che le vede per la prima volta. Focus sull'esperienza utente: "adesso il cameriere può...", "lo schermo mostra...", "il cliente vede..."]

AVANZAMENTO PROGETTO
[Barra visiva + percentuale + milestone attuale + prossima milestone]

PROSSIMA SETTIMANA
[2-3 bullet. Cosa è previsto. Niente promesse, solo direzione.]

A presto,
Eros
```

### Step 5 — Salva il file

Determina la data odierna con:
```bash
date +%Y-%m-%d
```

Salva il report in:
```
reports/walbox-report-YYYY-MM-DD.md
```

Se la cartella `reports/` non esiste, creala prima.

### Step 6 — Conferma

Stampa in chat:
```
Report salvato in: reports/walbox-report-YYYY-MM-DD.md
Commit git usati: N
Periodo coperto: [data inizio] → [data fine]
Fonte memoria: aggiornata / parziale (dichiarare se parziale)
```

---

## Vincoli

- Non modificare nessun file del codebase
- Non toccare App.jsx, routing, Supabase, Spotify, env, package.json
- Non creare file fuori dalla cartella `reports/`
- Non inventare funzionalità non presenti nei commit o nella memoria
- Se i dati sono insufficienti, dichiararlo nel report invece di inventare

---

## Output atteso

Un file markdown pronto per essere copiato in una email, leggibile da chiunque, che non richiede conoscenze tecniche per essere compreso.
