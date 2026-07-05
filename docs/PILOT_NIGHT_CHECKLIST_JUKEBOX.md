# PILOT NIGHT CHECKLIST — JUKEBOX / SHUFFLE NIGHT

> Creato: 2026-07-05
> Track: Jukebox/Spotify reale per Walrus Shuffle Night (non Kitchen)
> Riferimento: docs/PILOT_NIGHT_CHECKLIST.md (Kitchen) usato solo come riferimento di formato

---

## 1. Obiettivo della checklist

Questa checklist serve a decidere, prima di ogni serata Shuffle Night, se il flusso
Jukebox è **demo-stabile** (GO) o se conviene rimandare/limitare la serata (NO-GO).
Non sostituisce `docs/PILOT_NIGHT_CHECKLIST.md`, che resta la checklist Kitchen.

---

## 2. Scope

**Incluso:**
- QR cliente (entry tavolo)
- Invio richiesta canzone
- Nickname / dedica / mood, se presenti nel flusso attivo
- Staff Dashboard (approvazione/rifiuto)
- Spotify queue / play now
- TV Poster / now playing
- Supabase realtime (sync cross-device)
- Fallback staff in caso di errore
- Test manuale al locale (venue reale)

**Escluso:**
- Kitchen (menu, ordini, banco/ritiro) → vedi `docs/PILOT_NIGHT_CHECKLIST.md`
- Pagamenti
- Loyalty / punti / promo
- Feature future non ancora implementate (music bingo, classifiche, ecc. — vedi memoria `shuffle-night-thursday-ops`)

---

## 3. Pre-flight tecnico

| Check | Stato |
|---|---|
| `.env.local` presente con variabili Supabase/Spotify richieste (senza stamparne il valore) | PASS / FAIL / N.A. |
| Supabase raggiungibile (endpoint risponde) | PASS / FAIL / N.A. |
| Account Spotify Premium disponibile e loggato | PASS / FAIL / N.A. |
| Device Spotify attivo (telefono/PC con app aperta) | PASS / FAIL / N.A. |
| Route cliente (`/entry`, `/request` o equivalenti) raggiungibile | PASS / FAIL / N.A. |
| Route staff (`/staff`) raggiungibile e login/accesso funzionante | PASS / FAIL / N.A. |
| Route TV Poster (`/tv-poster`) raggiungibile | PASS / FAIL / N.A. |
| Build disponibile (`npm run build` pulita) | PASS / FAIL / N.A. |
| Browser/device reali disponibili per test (non solo dev tools) | PASS / FAIL / N.A. |

Note: ______________________________________________

---

## 4. Flusso cliente

- [ ] QR apre la pagina corretta (tavolo pre-compilato se previsto)
- [ ] Cliente inserisce nickname
- [ ] Cliente cerca un brano
- [ ] Risultati Spotify visibili (cover, titolo, artista)
- [ ] Cliente invia la richiesta
- [ ] Richiesta entra in stato `pending`
- [ ] Cliente riceve un feedback comprensibile dopo l'invio

---

## 5. Flusso staff

- [ ] Staff vede le richieste `pending`
- [ ] Staff può approvare una richiesta
- [ ] Staff può rifiutare una richiesta
- [ ] Staff vede un warning se la richiesta approvata non ha `spotify_uri`
- [ ] Staff può usare "Avvia subito" / play now se previsto dal flusso
- [ ] Staff capisce quando l'aggiunta alla coda Spotify fallisce
- [ ] Staff riesce a gestire più richieste consecutive senza bloccarsi

> Nota nota (vedi sezione 12): il warning attuale è un banner a pagina intera con
> auto-dismiss a 5 secondi, non un badge persistente sulla singola richiesta —
> verificare durante il test se questo è sufficiente sotto carico reale.

---

## 6. Spotify reale

- [ ] Account Premium loggato correttamente
- [ ] Device attivo e selezionato
- [ ] `addToQueue` funziona (brano entra davvero in coda Spotify)
- [ ] "Play now" / avvio immediato funziona, se previsto
- [ ] Skip funziona, se previsto dal flusso staff
- [ ] Now playing letto correttamente da Spotify (titolo/artista/cover reali)
- [ ] Un fallimento Spotify (token scaduto, device assente, rete) è visibile allo staff, non solo in console
- [ ] Test eseguito con almeno 3 brani consecutivi approvati

---

## 7. TV Poster / schermo locale

- [ ] Route TV accessibile su schermo/PC del locale
- [ ] Visual leggibile a distanza (zoom 100%, no testo troppo piccolo)
- [ ] Now playing su TV coerente con lo stato reale di Spotify
- [ ] Coda/prossimo brano visibile, se previsto dal layout
- [ ] Refresh/realtime stabile (nessun freeze prolungato)
- [ ] Nessun elemento di debug/dev visibile (log, placeholder, bordi di sviluppo)

---

## 8. Realtime / multi-device

- [ ] Cliente e staff su device fisicamente diversi
- [ ] Due clienti concorrenti che inviano richieste nello stesso momento
- [ ] Staff Dashboard si aggiorna senza refresh manuale
- [ ] TV Poster si aggiorna senza refresh manuale
- [ ] Comportamento verificato dopo un reload di pagina (staff e/o TV)

---

## 9. Fallback manuale serata

| Situazione | Azione staff |
|---|---|
| Spotify non risponde | Riprovare login su `/spotify-test`; se persiste, avviare i brani manualmente dall'app Spotify sul device venue |
| Il brano approvato non entra in coda | Verificare warning in Staff Dashboard; aggiungere manualmente il brano da Spotify se necessario |
| TV non aggiorna | Ricaricare la pagina TV Poster (F5); se persiste, comunicare a voce il brano in corso |
| Supabase realtime rallenta | Ricaricare Staff Dashboard; verificare connessione internet del locale |
| Cliente invia un brano sbagliato/inadatto | Staff rifiuta la richiesta dalla Dashboard |
| La rete locale cade | La musica non dipende dall'app: continuare con playlist normale su Spotify finché la rete non torna (vedi memoria `shuffle-night-thursday-ops`) |

---

## 10. Go / No-Go decision

| Area | Minimo richiesto | Stato | Note | Bloccante |
|---|---|---|---|---|
| QR cliente | Apre pagina corretta, richiesta inviabile | | | Sì |
| Staff Dashboard | Pending visibili, approvazione/rifiuto funzionanti | | | Sì |
| Spotify queue reale | Almeno 1 richiesta entra davvero in coda su device reale | | | Sì |
| TV Poster | Stato coerente con Spotify, oppure fallback chiaro comunicato allo staff | | | Sì |
| Gestione errori staff | Staff sa cosa fare in caso di fallimento Spotify/Supabase/TV | | | Sì |
| Realtime multi-device | Aggiornamento senza refresh manuale | | | No (ma fortemente consigliato) |

**Regola GO:** procedere solo se tutte le righe marcate "Bloccante: Sì" sono verificate PASS.
Se anche una sola è FAIL, la serata è **NO-GO** o parte con limitazioni esplicite comunicate allo staff.

---

## 11. Pilot night manual test script

Script operativo passo-passo da eseguire fisicamente al locale prima dell'apertura:

1. Apri Spotify sul device del venue, verifica account Premium e device attivo
2. Apri Staff Dashboard su device staff
3. Apri TV Poster sullo schermo del locale
4. Scansiona il QR da un telefono cliente
5. Invia una richiesta di prova
6. Approva la richiesta da Staff Dashboard
7. Verifica che il brano sia entrato nella coda Spotify reale
8. Verifica che TV Poster mostri lo stato coerente (now playing/coda)
9. Invia una seconda richiesta da un secondo telefono (mini-stress concorrenza)
10. Verifica comportamento sotto mini-stress (Staff Dashboard e TV restano coerenti)
11. Segna PASS/FAIL su ogni passo e passa alla sezione 13

---

## 12. Known limitations

- L'E2E automatico (Playwright) copre entry/ricerca/UI ma **non** copre approvazione → coda Spotify → now-playing con account reale: quella parte è verificabile solo con il test manuale di questa checklist.
- Spotify Premium e device fisico non sono simulabili in CI: il test reale (sezione 6 e 11) è l'unica verifica disponibile.
- Il warning "brano senza `spotify_uri` / coda fallita" in Staff Dashboard è confermato **non persistente**: banner a pagina intera con auto-dismiss a 5 secondi, non un badge per singola richiesta — da tenere d'occhio durante il test se lo staff è impegnato con più richieste.
- S11 (Supabase dual-write con localStorage) risulta ancora aperto in CHECKPOINT.md — deferred per cross-tab sync, non blocca la serata ma resta debito tecnico noto.

---

## 13. Final report template

```
Data: __________
Luogo/device: __________
Account Spotify usato: __________
Test eseguiti (sezioni): __________
Risultato: PASS / FAIL
Bug trovati: __________
Decisione: GO / NO-GO
Prossimo fix da programmare: __________
```
