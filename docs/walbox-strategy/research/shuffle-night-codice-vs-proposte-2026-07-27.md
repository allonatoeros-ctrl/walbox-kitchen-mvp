# RESEARCH — Codice vs 4 Proposte Shuffle Night (2026-07-27)

Obiettivo: verificare, solo leggendo il codice reale, quanto le 4 proposte "realizzabili ora" siano già supportate. Metodo: lettura dei 7 file indicati in `/home/eros/projects/walbox` + grep mirati. Nessuna modifica.

## 1) Nome + tavolo sul TV — ⚠️ A METÀ (manca poco)
- Il nickname viene raccolto: `CustomerEntry.jsx` (state `nickname` r.6, passato in query r.38) e salvato su DB: `insertRequest()` in `useSongRequests.js` r.40-52 (colonna `nickname`).
- Lo Staff lo vede già: `StaffDashboard.jsx` r.631 e r.721 (`Tavolo X • nickname`).
- MA sul TV (`LiveTvScreenWalrusPoster.jsx`) il takeover mostra solo `TAVOLO {req.table}` (r.231) e il ticker solo `TAVOLO {r.table}` (r.205). Il nickname NON è mai renderizzato sul TV (c'è solo un commento che lo cita, r.126). Manca: aggiungere `takeoverRequest.nickname` al takeover/ticker. Poche righe.

## 2) Reazioni live che pesano sulla coda — ⚠️ A METÀ (parte grossa mancante)
- Esistono reazioni, ma SOLO staff→TV: `StaffDashboard.jsx` `handleTriggerReaction()` r.55-64 (scrive `walbox_tv_reaction` in localStorage, cooldown 15s) e il TV le mostra 6s (`LiveTvScreenWalrusPoster.jsx` r.30-55, 146-153, 215-224).
- Limite: via localStorage funziona solo tra tab dello stesso browser, non da telefoni dei clienti.
- Il campo `reaction` esiste nello schema richieste (`useSongRequests.js` r.34 e r.47, sempre `null`) ma NON c'è alcuna UI cliente per reagire, NESSUN conteggio, e la coda NON viene mai riordinata in base a reazioni (ordinamento = solo `created_at`, r.99). Manca la parte "pesa sulla coda": non c'è proprio.

## 3) Leaderboard serale effimera — ❌ NON C'È
- Nessuna traccia: grep di `leaderboard|classifica|punti|score` su tutto `src/` = zero risultati.
- Materia prima però disponibile: `useRealtimeRequests()` ha tutte le richieste con `table`, `nickname`, `status` (`useSongRequests.js` r.79-141) → una classifica "tavolo più attivo" è calcolabile lato client. C'è anche `closeAllActiveRequests()` (r.70-77) utile come "chiusura serata". Ma UI e logica punti: da fare da zero.

## 4) Moderazione staff 1-tap + libreria vibe-safe — ⚠️ METÀ E METÀ
- Moderazione 1-tap: GIÀ C'È. `StaffDashboard.jsx`: APPROVA r.658 (`handleApprove`, r.329) e RIFIUTA r.666 (`updateStatus(id,'rejected')`), con guard anti doppio tap (`withPendingGuard` r.39-52). Pausa coda già presente: `setQueuePaused()` in `useVenueSettings.js` r.5-12, rispettata dal cliente (`CustomerRequest.jsx` r.115).
- Libreria vibe-safe: NON C'È. La ricerca cliente usa Spotify aperto (`/api/search`, `CustomerRequest.jsx` r.158-205) con fallback `MOCK_SONGS` (15 brani demo in `mockData.js` r.2-123). Nessuna blacklist/whitelist/filtro genere: grep `vibe|blacklist|banned` = zero.

Nota: `mockData.js` da r.196 in giù è vecchia logica demo localStorage, in gran parte superata da Supabase — non contare su quelle funzioni.

## Sintesi
| Proposta | Stato |
|---|---|
| 1. Nome+tavolo TV | A metà — nickname in DB, manca solo render sul TV |
| 2. Reazioni→coda | A metà — reazioni solo staff/localStorage; peso sulla coda assente |
| 3. Leaderboard | Assente — dati disponibili, UI/logica da zero |
| 4. Moderazione + vibe-safe | Moderazione già fatta; libreria vibe-safe assente |
