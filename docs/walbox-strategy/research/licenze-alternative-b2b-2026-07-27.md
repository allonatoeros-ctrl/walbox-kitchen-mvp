# Walbox — Alternative B2B legali a Spotify per lo Shuffle Night (27/07/2026)

## Contesto (in breve, da banco)
Spotify consumer nel pub = vietato (ToS + legge). Servono comunque SIAE + SCF
(vedi report `licenze-siae-spotify-2026-07-27.md`). Qui: chi ci dà musica
"da locale" legale, con API per fare il jukebox social di Walbox.

## Le opzioni sul tavolo

### 1. Soundtrack Your Brand (Svezia) — LA favorita
- Streaming B2B full-license (100M+ brani), attivo in Italia. Copre i diritti
  di streaming commerciale; SIAE/SCF restano a carico del locale.
- Costo stimato: **~€30–60/mese per zona** (piani Essential/Unlimited, listino
  sul sito, IVA escl.). 2 sedi Walrus = 2 zone → ~€60–120/mese.
- **API vera**: GraphQL (`api.soundtrackyourbrand.com/v2/docs`) + Soundtrack SDK
  per partner tecnologici (playback, code, controllo remoto). Perfetta per
  Walbox: l'app vota, l'API accoda. Serve richiesta partnership (sdk@soundtrack.io).
- Fonti (verificate 200 OK):
  - https://www.soundtrackyourbrand.com/pricing
  - https://api.soundtrackyourbrand.com/v2/docs
  - https://developer.soundtrackyourbrand.com

### 2. Soundreef (Italia)
- Non è uno streaming: è l'ente di gestione diritti alternativo a SIAE.
  Repertorio proprio → in alcuni setup può sostituire/ridurre la pratica SIAE
  se si usa SOLO musica del loro catalogo. Niente API jukebox.
- Costo: licenza background music su preventivo (indicativamente poche
  centinaia di €/anno per locale piccolo).
- Fonte: https://www.soundreef.com (200 OK; pagina /it/musica-negozi/ → 404, scartata)

### 3. Rockbot (USA) — il "jukebox social" nativo
- Fa ESATTAMENTE il jukebox social (i clienti votano/richiedono da app).
- Costo: **da $25/mese per zona + player $175 una tantum** (verificato su pricing).
- MA: licenze coprono USA/Canada; uso in Italia da verificare col loro sales.
- Fonte: https://www.rockbot.com/pricing (200 OK)

### 4. Jukeboxy — scartata
- $29.99/mese, 45M brani, ma licenze **solo USA/Canada** (dichiarato in FAQ).
- Fonte: https://www.jukeboxy.com (200 OK)

(Mood Media Italia raggiungibile solo via moodmedia.com/it — soluzione
enterprise su preventivo, overkill per un pub.)

## Verdetto per il Walrus (pub piccolo, 2 sedi)
**Soundtrack Your Brand**: legale in Italia, prezzo da pub (~€100/mese totali),
e soprattutto ha API/SDK documentate → Walbox può integrarsi davvero.
SIAE+SCF si pagano comunque a parte.

## 3 idee Shuffle Night legali
1. **Vota-il-prossimo**: Walbox vota tra playlist Soundtrack, l'API accoda la vincente.
2. **Battle di genere**: rock vs indie a round da 20 min, il pubblico decide via QR.
3. **Shuffle Roulette**: ogni consumazione = 1 gettone digitale per uno "spin" che cambia mood.

## Rischi
- Partnership SDK Soundtrack non automatica (serve approvazione).
- SIAE+SCF restano dovute: lo streaming B2B non le sostituisce.
- Rockbot/Jukeboxy fuori copertura UE → multe se usate a Milano.
