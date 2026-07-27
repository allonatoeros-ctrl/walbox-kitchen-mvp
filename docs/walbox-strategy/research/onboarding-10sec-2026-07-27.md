# Walbox — Onboarding cliente da QR a prima azione in <10 sec
_Research subagent — 2026-07-27 — The Walrus jukebox social_

## Contesto (stile pub)
Il cliente entra, si siede, inquadra il QR sul tavolo. Da quel momento hai ~10 secondi
prima che torni a guardare gli amici. Se lo fai penare con form e login, la prima canzone
non parte e il jukebox social muore. L'obiettivo: dallo scan alla prima azione (canzone/ordine)
senza attriti, zero app da scaricare, zero password.

## Best practice (dai competitor, fetch reale)
- **Spotify Jam**: si entra via link/QR o scansione "Spotify code" senza registrazione separata,
  tutti aggiungono brani alla stessa coda in tempo reale. Zero setup dell'ospite oltre l'app host. (support.spotify.com/us/article/jam/)
- **crowdDJ (Scan To Play)**: modello "scan → scegli traccia → in coda" pensato per venue,
  interattivita' immediata senza attrito, catalogo curato. (crowddj.com)
- **TouchTunes**: jukebox connesso, app mobile per pagare/mettere in coda da remoto nel locale;
  il QR/deep-link porta direttamente al locale gia' identificato. (touchtunes.com)
- Regola d'oro QR: il QR deve **pre-caricare tutto il contesto** (tavolo/venue) nell'URL, landing
  che apre nel browser (no app store), prima azione visibile above-the-fold, nickname opzionale.

## Gap nel codice Walbox attuale
- `CustomerEntry.jsx`: legge `?table=` dall'URL (buono) MA **obbliga comunque il cliente a
  premere Continua** e valida il campo tavolo. Se il QR contiene gia' `?table=5`, potresti
  saltare del tutto questa schermata → sono 1-2 tap e ~5 sec regalati.
- Nickname c'e' gia' come opzionale (bene), ma l'utente lo vede come step.
- `CustomerRequest.jsx`: se manca `table` rimbalza a `/entry`; ok, ma la ricerca Spotify
  (`isSearching`, `spotifyResults`) parte solo dopo che il cliente digita → nessun contenuto
  "pronto al tap" all'arrivo (coda/trending vuoti a schermo).
- Nessun deep-link diretto QR → `/request?table=X` che bypassi la entry.

## 3 idee per speed-up (<10 sec)
1. **QR punta diretto a `/request?table=X`**: se il tavolo e' nell'URL, salta `CustomerEntry`,
   salva sessione in localStorage al volo e mostra subito la coda. Entry solo come fallback.
2. **Trending/Coda pre-caricata**: all'arrivo mostra 5-6 brani hot tappabili (come crowdDJ),
   cosi' la "prima azione" e' 1 tap senza digitare. Nickname chiesto DOPO la prima richiesta.
3. **Sticky CTA "Metti la tua canzone"** above-the-fold + ricerca gia' in focus, cover grandi;
   niente mood/dedica obbligatori al primo giro (progressive disclosure).

## Rischi
- Saltare la entry: tavolo sbagliato nel QR → richieste su tavolo errato (metti conferma leggera).
- Nickname opzionale → coda anonima, meno "social"; incentivare senza obbligare.
- Pre-caricare Spotify a freddo = costo API/latenza; usa cache o mock trending.
- Abuso/spam senza barriera: valuta rate-limit soft.

## Fonti (fetch reale, HTTP 200)
- https://support.spotify.com/us/article/jam/
- https://crowddj.com/
- https://www.touchtunes.com/
