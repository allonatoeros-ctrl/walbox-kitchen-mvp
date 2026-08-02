# Audit READ-ONLY — fanta_walrus_custom_team → useMatchday → FantaMatchday

Branch: feat/fantawalrus-product-flow · Nessun file modificato.

## File letti
- `src/fanta/pages/FantaTeamBuilder.jsx`
- `src/fanta/hooks/useMatchday.js`
- `src/fanta/hooks/useMatchday.test.js` (non aperto in dettaglio, solo elenco)
- `src/fanta/pages/FantaMatchday.jsx`
- `src/fanta/data/teams_sample.json`
- `src/fanta/engine/replayEngine.js`
- `src/fanta/engine/scoreEngine.js`
- `src/fanta/pages/FantaEntryTesseramento.jsx` (per formato `teamId`)
- `src/App.jsx` (routing `/fanta/matchday`)

## CURRENT_CONTRACT (quello salvato dal Team Builder in localStorage `fanta_walrus_custom_team`)

`FantaTeamBuilder.jsx:87-101` (`handleSave`):

```js
{
  teamId: identity.teamId,        // es. "team_<hash>", da fanta_walrus_team_identity
  formation: "4-3-3",             // hardcoded
  roster: selectedIds.map(id => ({ id, isStarter: true })), // SOLO gli 11 titolari
  updatedAt: ISOString
}
```

Note:
- `roster` contiene **solo 11 elementi**, tutti `isStarter:true`. Nessuna panchina.
- Nessun `teamName`, `crestId` salvati in questo oggetto (esistono solo in `fanta_walrus_team_identity`, chiave separata).
- Validazione formazione fatta con `isValidLineup` prima del save (GK/DEF/MID/FWD/club) — corretta lato Builder.

## EXPECTED_CONTRACT (quello richiesto da useMatchday → replayEngine → scoreEngine)

`useMatchday.js` non legge localStorage: riceve `teams` come prop già pronta (array) e la passa a `createReplay` (`replayEngine.js:54-63`), che a sua volta passa a `scoreLeague`/`scoreTeam` (`scoreEngine.js:130,141,144`).

Shape richiesta per ogni team (da `teams_sample.json` + uso in `scoreEngine.js`):

```js
{
  teamId: string,
  formation: string,
  roster: [
    { id: string, isStarter: true },   // 11 titolari
    { id: string, isStarter: false },  // panchina — usata da resolveLineup per le sostituzioni SV (max 3, stesso ruolo, ordine roster)
    ...
  ]
}
```

`teamName`/`crestId` presenti in `teams_sample.json` ma **non letti** da `scoreEngine.js` (solo `teamId`, `formation`, `roster` sono usati). `formation` non risulta letto in `scoreTeam`/`resolveLineup` (grep non trova uso oltre al passaggio) — probabile campo solo informativo per ora.

`createReplay` valida solo fixtures/events/players (`validateInputs`), **non valida la shape di `teams`** — un roster senza panchina non genera errore esplicito, ma degrada silenziosamente la logica di sostituzione (0 sostituti disponibili).

## GAPS

1. **Nessun collegamento reale**: `FantaMatchday.jsx:8,31` importa `teamsData` staticamente da `teams_sample.json` e lo passa a `useMatchday`. **Non legge mai** `fanta_walrus_custom_team` da localStorage. La squadra custom creata dal Team Builder non entra mai nella giornata.
2. **Roster incompleto**: anche collegandolo, il contratto salvato dal Builder ha solo 11 titolari, zero panchina. `resolveLineup` (`scoreEngine.js:94-101`) itera `roster` cercando bench per le sostituzioni SV: con panchina vuota, sostituzioni impossibili (non è un crash, ma è un gap funzionale silenzioso).
3. **Nessun controllo duplicati/merge**: se si aggiunge la squadra custom a `teamsData`, serve decidere se sostituisce una squadra sample con lo stesso slot o si aggiunge in coda; `teamId` custom (`team_<hash>`) non collide con gli id sample (`t_001..t_008`), quindi append è sicuro lato ID.
4. **Nessun fallback in FantaMatchday/useMatchday**: se si aggiunge lettura localStorage qui, oggi non esiste alcuna gestione per chiave assente/JSON invalido/roster corto in questo punto (il fallback attuale esiste solo nel Builder stesso, per ripristinare la selezione UI, non per l'uso in Matchday).
5. **`teamName`/`crestId` mancanti** nell'oggetto custom: se in futuro la UI Matchday mostra il nome squadra (oggi mostra solo `teamId`, `FantaMatchday.jsx:119`), servirà leggerli da `fanta_walrus_team_identity` e unirli.

## MINIMAL_ADAPTER

Funzione pura, testabile, senza toccare `useMatchday.js`/`replayEngine.js`/`scoreEngine.js`:

```js
// src/fanta/adapters/customTeamAdapter.js (nuovo file)
export function adaptCustomTeam(rawLocalStorageValue, allPlayers) {
  // 1. parse sicuro (try/catch) — invalid => null
  // 2. valida shape minima: teamId string, roster array non vuoto
  // 3. filtra roster a id validi in allPlayers
  // 4. se bench mancante, roster resta solo titolari (nessuna sostituzione possibile) — comportamento esplicito, non crash
  // 5. ritorna { teamId, formation, roster } compatibile con scoreEngine, o null
}
```

In `FantaMatchday.jsx`: leggere `fanta_walrus_custom_team`, passare attraverso l'adapter, e se valido fare `[...teamsData, customTeam]` (o sostituire se stesso `teamId` già presente) prima di passarlo a `useMatchday({ teams })`.

## FILES (da modificare, quando approvato)

- **Nuovo**: `src/fanta/adapters/customTeamAdapter.js` (funzione pura di mapping/validazione)
- **Target esistente**: `src/fanta/pages/FantaMatchday.jsx` (unica modifica: leggere localStorage + merge in `teamsData` prima di `useMatchday`)
- **Non toccare**: `useMatchday.js` (contratto già corretto e generico), `replayEngine.js`, `scoreEngine.js`, `FantaTeamBuilder.jsx` (salvo se si decide di far salvare anche la panchina — task separato), `teams_sample.json`, `App.jsx` (routing, protetto).

## TESTS (da aggiungere)

- `customTeamAdapter.test.js`:
  - localStorage assente → `null`
  - JSON invalido → `null` (no throw)
  - roster con id non esistenti in `players.json` → filtrati/`null` se sotto soglia minima
  - roster valido (11 titolari, 0 bench) → oggetto valido, bench vuoto esplicito
  - roster valido con bench → passthrough corretto
- Test d'integrazione leggero su `FantaMatchday` (se testato oggi — verificare presenza `FantaMatchday.test.jsx`, non trovato in questo audit) per verificare che la squadra custom appaia in `teamsData` passato a `useMatchday` quando presente in localStorage.

## RISKS

- Il gap panchina-vuota è **comportamentale, non un bug che rompe il build**: gioco funziona ma senza sostituzioni SV per la squadra custom. Va deciso se è accettabile per il V1 o se il Builder deve iniziare a salvare anche la panchina (fuori scope di questo micro-task, tocca `FantaTeamBuilder.jsx` che è area già "in produzione" per l'utente finale).
- `scoreEngine.js`/`replayEngine.js` sono core engine puri e testati: **non vanno toccati** per questo collegamento, solo l'adapter e `FantaMatchday.jsx`.
- Se in futuro si vuole mostrare `teamName`/crest nella classifica di Matchday, serve leggere anche `fanta_walrus_team_identity` — non richiesto da questo task, da tenere come nota.

## NEXT_TASK

Micro-task proposto (un solo obiettivo): creare `customTeamAdapter.js` + wiring minimo in `FantaMatchday.jsx` per includere la squadra custom (se presente e valida) nell'array `teams` passato a `useMatchday`, con fallback silenzioso a `teams_sample.json` se localStorage assente/invalido. Bench vuota accettata come limite noto V1 (da riportare a Eros per decisione esplicita se serve fix sul Builder).
