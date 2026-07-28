# WALBOX_FUTURE_MODULES_PLAN.md

Piano scritto dei moduli futuri (Mese 5→12 del `WALBOX_FULL_VISION_12_MONTHS.md`) con
dipendenze esplicite. Generato in audit read-only il 2026-07-25.

Regola madre (CLAUDE.md §7 + piano §6/§7):
**nessun ponte Core/points/promo prima che Jukebox sia stabile e verificato con Spotify reale.**

---

## 0. Stato attuale (da CHECKPOINT.md, 2026-07-25)

| Modulo | Piano (Mese) | Stato repo reale |
|---|---|---|
| Jukebox / Poster | 1-2 | IN CORSO — Spotify reale, auto-advance, TV sync; da chiudere per Shuffle Night |
| Kitchen | 3-4 | COMPLETO + STABLE (fuori scope, non toccare) |
| Core / Punti | 5 | NON esiste |
| Promo Engine | 6 | NON esiste |
| Events | 7 | NON esiste |
| Merch | 8 | NON esiste |
| Social | 9 | NON esiste |
| Website / Booking | 10 | NON esiste |
| Gestionale leggero | 11 | NON esiste |
| Consolidamento | 12 | NON esiste |

---

## 1. Moduli futuri e dipendenze

### M5 — WALBOX CORE (profilo leggero + Punti base)
- **Dipende da:** Jukebox STABILE + VERIFICATO (Spotify Premium reale, E2E) + Kitchen stabile.
- **Non dipende da:** Promo/Events/Merch (Core è la radice del ponte, non viceversa).
- **Output minimo:** tavolo, nickname, profilo Walrus leggero, punti finti/semi-reali,
  punti per ordine Kitchen, punti per richiesta Jukebox.
- **Vincolo:** dati Core separati da mockData Jukebox (come kitchenMockData.js).
- **Gating:** NON iniziare finché CHECKPOINT non segna Jukebox "demo-ready + QA serata PASS con Spotify reale".

### M6 — WALBOX PROMO ENGINE
- **Dipende da:** M5 Core (i punti premio vivono nel Core) + Kitchen menu (combo panino+birra+patatine).
- **Output minimo:** cocktail del giorno/mese, drink list, combo food, promo staff-managed.
- **Vincolo:** promo legge/scrive solo tramite Core, mai accoppiata diretta a Jukebox.

### M7 — WALBOX EVENTS
- **Dipende da:** M5 Core (premi collegati a punti) + TV screen (event screen).
- **Output minimo:** quizzone, Fantacalcio, Fantasanremo, calendario eventi, TV/event screen.
- **Vincolo:** eventi producono punti solo tramite Core.

### M8 — WALBOX MERCH
- **Dipende da:** M5 Core (premi punti) + M6 Promo (promo merch).
- **Output minimo:** catalogo merch, promo merch, premi punti, stock manuale demo, CTA acquisto/richiesta.
- **Vincolo:** e-commerce completo POSTICIPATO (regola piano §4.7).

### M9 — WALBOX SOCIAL
- **Dipende da:** M7 Events (finalisti TV) + M5 Core (premio punti).
- **Output minimo:** contest social, classifica/selezione staff, TV screen dedicata, materiale SMM.
- **Vincolo:** non sostituisce il social media manager (piano §4.8).

### M10 — WALBOX WEBSITE / BOOKING
- **Dipende da:** M5 Core (profilo/QR) + M8 Merch (merch online) + Jukebox/Kitchen dimostrati.
- **Output minimo:** landing, menu online, eventi, prenotazioni base, link app/QR.
- **Vincolo:** solo DOPO Jukebox + Kitchen MVP chiusi (piano §4.9).

### M11 — GESTIONALE LEGGERO
- **Dipende da:** M6 Promo + M7 Events + M8 Merch (manager base per ciascuno).
- **Output minimo:** dashboard staff ordinata, promo/eventi/merch manager base, report leggero.

### M12 — CONSOLIDAMENTO
- **Dipende da:** tutti i precedenti.
- **Output minimo:** polish UX, test reali, bugfix, documentazione, pitch, pacchetto demo rivendibile.

---

## 2. Catena di dipendenze (ordine di sblocco)

```
Jukebox STABILE+VERIFICATO ──┐
Kitchen STABILE (già OK) ────┴─► M5 CORE ─► M6 PROMO ─┬─► M7 EVENTS ─┬─► M9 SOCIAL
                                                        └─► M8 MERCH ──┘
M5+M6+M7+M8 ─► M10 WEBSITE ─► M11 GESTIONALE ─► M12 CONSOLIDAMENTO
```

Il **ponte** (tavolo/nickname/punti/promo condivisi) nasce solo in M5 e si propaga a valle.
Nessun modulo M6+ può essere costruito prima di M5.

---

## 3. Cosa è lecito sviluppare OGGI (senza deroga §7)

- Solo chiusura Jukebox / Shuffle Night (Mese 1-2): PILOT_NIGHT_CHECKLIST, stash rebrand
  CustomerEntry/CustomerRequest, fix coda staff, Reality Sprint 02 (venue_settings Supabase,
  area protetta → serve approvazione dedicata).
- Tutto M5+ è BLOCCATO finché CHECKPOINT non segna Jukebox "demo-ready + QA serata PASS reale".

## 4. Se Eros vuole anticipare un modulo futuro (deroga §7)

Va fatta come **modulo isolato**, senza bridge a Jukebox/Kitchen:
- Events (M7) o Merch (M8) come modulo standalone, dati propri, nessun punto condiviso.
- La deroga va approvata esplicitamente e tracciata in CHECKPOINT.md come eccezione.

---

## 5. Prossimo step proposto

1. Eros conferma questo piano (o lo corregge).
2. Se Jukebox va chiuso prima: micro-task da PILOT_NIGHT_CHECKLIST (Gate 1 → esecuzione → Gate 2).
3. Se si vuole anticipare un modulo futuro: servono deroga §7 + piano micro-task dedicato.
