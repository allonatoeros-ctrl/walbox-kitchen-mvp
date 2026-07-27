# Benchmark UX — Jukebox Social & Music-Request per Pub
### Walbox / The Walrus Pub (Milano) — "Shuffle Night" pilota
Data: 2026-07-27 (rev. 2 con fonti web verificate) · Autore: subagent RESEARCH

## Obiettivo
Capire come i concorrenti gestiscono la richiesta musicale al tavolo e quali
pattern UX Walbox può prendere (o superare) per rendere la "Shuffle Night" un
rituale sociale da pub, non l'ennesimo jukebox a gettoni digitale.

## Metodo
Rev. 2: verifica web diretta (siti ufficiali, App Store, pagine prodotto) di 7
player/categorie, con controllo dello stato reale dei prodotti (alcuni risultano
morti o diversi da come li avevamo descritti — vedi "Correzioni"). Focus sui
touchpoint UX da locale: onboarding QR, richiesta brano, controllo staff,
schermo now-playing, social/classifiche, gamification e promo.

## Concorrenti analizzati (dati verificati)

| Nome | Target | Modello di business | UX chiave | Punti di forza | Debolezze |
|---|---|---|---|---|---|
| **TouchTunes** | Bar/ristoranti/brewery USA & Canada | Jukebox fisico via operatore locale, revenue-share col locale; utente paga i "credits" in-app | App mobile→jukebox in venue, pay-per-play e priorità a pagamento (Fast Pass), music filtering per il locale, licenze incluse | Brand dominante, catalogo enorme, app con rating 4.9 e ~1,1M valutazioni su App Store, genera revenue per il locale, installazione/assistenza incluse | Pay-to-play freddo per il cliente, hardware dedicato + operatore, footprint quasi solo Nord America, zero layer social/community/nickname |
| **crowdDJ (Nightlife Music, AU)** | Bar, club, palestre, hotel, navi da crociera | B2B in bundle con abbonamento Nightlife (media player commerciale + consulenza playlist); gratis per il cliente finale | "Scan To Play": QR su schermi/dischi→web/app, libreria brand-safe curata dal locale, staff app per coda/skip/volume/karaoke, integrazione Spotify account del cliente | Il vero riferimento del modello "cliente=DJ ma il locale comanda": voto/coda + controllo staff maturo, karaoke e TV integrati, casistica reale in centinaia di venue | Legato all'ecosistema/hardware Nightlife (Australia-centrico), niente identità sociale del richiedente sul TV, niente reward/gamification per il cliente |
| **Requestify (requestify.net)** | DJ, cantanti, band e venue (20.000+ performer dichiarati) | Freemium SaaS: piano free + piano Advanced; tips (mance) integrate come leva di guadagno | QR/link→richiesta senza app né signup, voto, commenti, tips, pagine per evento o "request page" fissa, dashboard performer per accettare/gestire | Attrito zero per il pubblico, tipping ben fatto, gestione richieste senza interrompere lo show | Centrata sul performer umano, non su playlist automatica; niente now-playing TV social, niente community persistente del locale |
| **Pixi** | ⚠️ NON VERIFICATO | — | — | — | Nessun prodotto "Pixi schermo interattivo per pub" trovato online: pixiapp.com è in vendita, wearepixi.com è uno studio creativo di Praga, altre varianti sono morte o off-topic. Da rimuovere dal benchmark finché non salta fuori una fonte reale |
| **Jooki** | Consumer/bambini (speaker + token NFC) | Vendita hardware — **prodotto DISMESSO** | Carte/figure NFC fisiche per lanciare playlist | Onboarding fisico giocoso (storico) | Il sito ufficiale dichiara "Jooki is no longer available for sale" (solo supporto archiviato). Fuori mercato e comunque off-scope per locali |
| **Soundtrack Your Brand (soundtrack.io)** | Catene, retail, hospitality | SaaS per zona/mese (piani Starter, Essential, Unlimited, Enterprise; prezzi dinamici per mercato, fatturazione "per zone and month") | Streaming licenziato B2B, playlist curate/AI, multi-location dashboard, controllo remoto; nessuna richiesta dal cliente finale | Licenze in regola, scala multi-sede, curatela professionale | Top-down puro: il cliente del locale non tocca nulla — zero social, zero richiesta, zero engagement in sala |
| **Rockbot (Request)** | Bar, ristoranti, palestre, retail USA | SaaS B2B (musica + digital signage + TV), trial gratuito, pricing a pacchetti | App "Rockbot Request": ospiti richiedono e votano brani ma solo dentro la playlist on-brand del locale; signage/TV integrati | Buon compromesso richiesta-cliente vs controllo-brand, suite TV/signage per il now-playing | Richiede app/piattaforma Rockbot, esperienza più "corporate" che da pub, niente nickname/leaderboard sociale |
| **Social jukebox generici (QR/web)** | Feste, meetup, piccoli locali | Free o quasi (spesso side-project) | QR/link→coda condivisa, voto; es. Spotify Jam (QR→coda condivisa, host Premium, anche su TV) e jukebox.today (stanze YouTube sincronizzate, zero account) | Attivazione istantanea, gratuiti, zero download | Commodity fragile: jukebox.today dichiara esso stesso bug noti (skip casuali, mobile inaffidabile); Spotify Jam non ha moderazione staff né identità del locale; nessuna fidelizzazione, spam/troll facili |

## Pattern UX ricorrenti (confermati dalle fonti)
- **QR → web senza download**: standard de facto (crowdDJ "Scan To Play", Requestify, Spotify Jam). L'attrito zero è vincente.
- **Libreria "brand-safe" del locale**: crowdDJ e Rockbot limitano le richieste alla playlist del locale — è questa, più che l'approvazione brano-per-brano, la moderazione dominante.
- **Controllo staff in tempo reale**: coda riordinabile, skip, volume (crowdDJ staff app) — confermato come feature "seria".
- **Now-playing su TV**: presente (crowdDJ/Rockbot/Jam su TV) ma MAI collegato all'identità di chi ha richiesto il brano. Gap confermato.
- **Monetizzazione**: pay-per-play/priorità (TouchTunes) o tips al performer (Requestify). Nessuno premia il cliente: il "reward" resta terreno libero.

## Correzioni al benchmark precedente (rev. 1)
1. **"Jukebot / CrowdDJ" era impreciso**: non esiste un "Jukebot" verificabile (domini morti). Il prodotto reale è **crowdDJ di Nightlife Music (AU)** — e non ha "UI datata": è una piattaforma matura con staff app, karaoke, Spotify connect e QR Scan To Play. La debolezza vera è il lock-in hardware Nightlife, non l'interfaccia.
2. **Pixi non verificato**: nessuna traccia di un prodotto "schermo interattivo per pub" con questo nome. La riga rev. 1 era un'assunzione: rimossa/flaggata.
3. **Jooki è morto**, non solo "off-scope": il sito ufficiale conferma che non è più in vendita.
4. **Requestify**: la piattaforma live è requestify.net (freemium + Advanced), rivolta a DJ/band/venue con tips; confermata la lettura "dipende da performer umano", ma la scala (20k+ performer) e la maturità del tipping erano sottostimate.
5. **Aggiunto Rockbot**, assente in rev. 1 ma competitor USA rilevante proprio sul quadrante "richiesta cliente + controllo brand + TV".
6. **TouchTunes**: confermato pay-to-play, ma va detto che per il locale è revenue positiva e le licenze sono incluse — la debolezza è l'esperienza cliente fredda, non il modello per il gestore.

## Gap Walbox (dove colpire) — invariati e ora corroborati
1. **Identità sociale del brano**: nessuno dei player verificati mostra *chi* ha chiesto la canzone sul TV. Walbox: nickname/tavolo sul now-playing → orgoglio + conversazione.
2. **Community persistente**: tutti usa-e-getta a serata (anche crowdDJ/Rockbot). Classifiche ricorrenti e "resident" del Walrus restano terreno libero.
3. **Reward invece di pay-to-skip/tips**: punti/promo (drink, priorità) al cliente — nessun competitor lo fa.
4. **Mood/reactions collettivi**: reazioni live (🔥/👎) che pesano sulla coda — assenti ovunque.
5. **Curatela staff "vibe-safe" leggera**: i big usano libreria pre-filtrata; Walbox può combinare blocklist + approvazione 1-tap per restare spontaneo ma protetto.

## Raccomandazioni (livello prodotto)
1. **"Tuo brano sul muro"**: now-playing TV con nickname + tavolo di chi ha richiesto → il social è il gancio, non il catalogo.
2. **Classifica Shuffle Night**: leaderboard serale/settimanale ("DJ della serata") che crea ritorno e chiacchiera al bancone.
3. **Reazioni live che pesano sulla coda**: 🔥 spinge su, 👎 declassa — engagement continuo.
4. **Reward, non paywall**: punti per richieste azzeccate/reazioni ricevute, riscattabili in drink/priorità.
5. **Moderazione staff a 1 tap** + libreria "vibe-safe" pre-filtrata in stile crowdDJ per le serate a tema.

## Rischi
- **Troll / brani fuori-vibe**: mitigare con libreria filtrata + moderazione staff (pattern crowdDJ/Rockbot).
- **Coda ingorgata nei picchi**: cap per tavolo + cooldown.
- **Licenze musicali**: i player seri (TouchTunes, SYB, Nightlife, Rockbot) vendono proprio la licenza B2B come feature — la zona grigia "account Spotify consumer nel locale" è un rischio reale da chiudere.
- **Affidabilità**: i jukebox web gratuiti si rompono (bug dichiarati da jukebox.today) — la solidità è un differenziatore.

## Fonti (verificate il 2026-07-27)
1. https://www.touchtunes.com/business/bars-restaurants — Pagina B2B TouchTunes per bar/ristoranti: pitch revenue, music filtering, installazione inclusa. (acc. 2026-07-27)
2. https://business.touchtunes.com/ — Portale business TouchTunes (redirect a bars-restaurants), soluzione musicale "fully licensed". (acc. 2026-07-27)
3. https://apps.apple.com/us/app/touchtunes-jukebox-music/id378351144 — App Store: TouchTunes app, rating 4.9 con ~1,1M valutazioni. (acc. 2026-07-27)
4. https://www.nightlife.com.au/crowddj — Pagina ufficiale crowdDJ: Scan To Play via QR, staff app (coda/skip/volume/karaoke), libreria brand-safe, Spotify connect, hardware Nightlife Media Player. (acc. 2026-07-27)
5. https://crowddj.com/ — Sito consumer crowdDJ: "Choose the music, control the vibe" in gym/café/bar/negozi. (acc. 2026-07-27)
6. https://requestify.net/ — Requestify: piattaforma richieste+tips per DJ/band/venue, QR senza app né signup, voto e commenti, freemium + piano Advanced, 20.000+ performer dichiarati. (acc. 2026-07-27)
7. https://jooki.com/ — Sito ufficiale Jooki: "Jooki is no longer available for sale", solo supporto archiviato. (acc. 2026-07-27)
8. https://www.soundtrack.io/pricing/ — Pricing Soundtrack Your Brand: piani Starter/Essential/Unlimited/Enterprise, fatturazione per zona/mese, prezzi dinamici per mercato. (acc. 2026-07-27)
9. https://rockbot.com/ — Rockbot: suite audio/video B2B con "Rockbot Request" (gli ospiti richiedono/votano dentro la playlist on-brand), digital signage e TV. (acc. 2026-07-27)
10. https://support.spotify.com/us/article/jam/ — Spotify Jam: coda condivisa via QR/link, host Premium, funziona anche su TV/speaker. (acc. 2026-07-27)
11. https://jukebox.today/ — Jukebox.today: social media player web (stanze YouTube sincronizzate, zero account) con "Known Issues" dichiarati — esempio di jukebox QR generico fragile. (acc. 2026-07-27)

Note: "Pixi" (schermo interattivo per pub) non ha trovato riscontro online al 2026-07-27; pixiapp.com risulta in vendita e i domini affini portano ad aziende non pertinenti.
