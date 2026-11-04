# WALRUS FOOD CLUB V1 — Installazione PWA e notifiche push (audit + specifica)

_2026-11-04 · solo audit, specifica e prototipo isolato. Nessuna modifica a codice, produzione, migration, deploy o git.
F1 e F6 NON avviate._ Codice letto: `origin/main` @ 595f639 (sola lettura, `git show`).
Legenda: **V** = verificato nel codice · **D** = dedotto / da verificare su dispositivo reale · **P** = proposta.

---

## 1. Audit PWA e push esistenti

| # | Cosa | Stato | Evidenza |
|---|---|---|---|
| A1 | **Manifest** `public/manifest.webmanifest`: name "Walbox Kitchen — The Walrus Pub", short_name "Walbox Kitchen", `start_url /kitchen`, `scope /`, `display standalone`, colori #121212. **Una sola icona**: `/favicon.svg` `sizes any`. Nessuna PNG 192/512, nessuna `maskable`, nessun `id`. | V | manifest |
| A2 | **iOS**: `apple-touch-icon.png` 180×180 presente, `apple-mobile-web-app-capable`, titolo "Walbox Kitchen", status bar black-translucent. Su iPhone l'aggiunta a Home è già corretta. | V | `index.html`, `sips` |
| A3 | **Installabilità Android**: Chrome chiede icone 192 e 512 px; con la sola SVG `any` l'evento `beforeinstallprompt` potrebbe non arrivare. Nessun codice gestisce `beforeinstallprompt` o `appinstalled`. | V (assenza codice) · D (criteri Chrome, da provare con DevTools → Application → Manifest su Android) | `git grep` |
| A4 | **Service worker** `public/sw.js`: solo `push` e `notificationclick` (nessuna cache, nessun `fetch`). `tag` = `kitchen-order-<id>`, click → `data.url` (default `/kitchen/status`). **Registrato solo dentro `activate()`**, cioè dopo il click su ATTIVA NOTIFICHE: chi non ha mai attivato non ha SW. | V | `sw.js`, `useWebPushSubscription.js` |
| A5 | **Hook** `useWebPushSubscription`: permesso chiesto **solo al click** (corretto). Se manca la sessione fa `signInAnonymously()`, poi RPC `kitchen_push_subscription_claim` (SECURITY DEFINER, uid preso dal server). Al mount, se il permesso è già concesso, segna `subscribed` ma **non** riassocia la sottoscrizione all'uid corrente e **non** aggiorna `last_seen_at`. `deactivate()` = unsubscribe + DELETE della propria riga. | V | hook |
| A6 | **UI** `NotificationOptIn` montato **solo** in `CustomerOrderStatus.jsx:109`. Overlay per ordine (scelta "continua senza" salvata per `orderId` in localStorage). Su iPhone non installato mostra solo un testo "aggiungi Walbox alla schermata Home" + CONTINUA, **senza istruzioni**. Dopo `denied` nessun loop (corretto). | V | componente |
| A7 | **Testo del consenso attuale**: "Riceverai solo l'avviso sul tuo ordine, **niente pubblicità**". Le sottoscrizioni esistenti **non** possono essere usate per notifiche Club o promo. | V | `NotificationOptIn.jsx` |
| A8 | **Tabella** `kitchen_push_subscriptions`: `customer_id` (FK `auth.users` ON DELETE CASCADE), `endpoint` UNIQUE, chiavi, `user_agent`, `created_at`, `last_seen_at`. RLS: SELECT/DELETE solo proprie; INSERT solo via RPC claim, che **riassegna** l'endpoint al nuovo uid. Nessun campo per categoria, consenso o dispositivo. | V | migration `20260924120000` |
| A9 | **Unica notifica esistente**: "Il tuo ordine è pronto!" (trigger → Edge Function `send-order-ready-push`, attesa oltre la finestra di annullamento, claim atomico `ready_push_claimed_at`, invio a tutte le sottoscrizioni del `customer_id`, pulizia 404/410, retry limitato). | V (codice) · **funzionamento reale NON verificato**: `CHECKPOINT.md` dice "prova reale su telefono mai fatta; chiavi VAPID su Vercel dichiarate, non verificate". | edge function, CHECKPOINT |
| A10 | **Retention**: cancella le sottoscrizioni con `last_seen_at` > 180 giorni. Siccome `last_seen_at` cambia solo al claim, la push di un iscritto attivo **verrebbe cancellata dopo 180 giorni** dall'attivazione. | V (bug latente per il Club) | migration `20261030140000:91` |
| A11 | **Anonimo → iscritto**: stesso dispositivo, `phone_change` mantiene lo stesso uid → la push resta (V in F0). Altro dispositivo / PWA iOS: nuovo uid dopo l'OTP → la push del dispositivo resta sul vecchio anonimo finché qualcuno non richiama il claim (oggi solo il click su ATTIVA). Il client non ricarica i dati al cambio utente (P5 di F0). | V (codice) · P7 di F0 non provato | F0 |
| A12 | **Conflitti ordini ↔ promo**: stesso SW, stessa tabella, nessuna categoria, nessuna fascia oraria, nessun limite di frequenza, nessun registro degli invii (solo log della funzione). | V | — |
| A13 | **Privacy** (`KitchenPrivacy.jsx`): la push è descritta solo come "avvisarti quando l'ordine è pronto", conservazione max 180 giorni. Va estesa per tessera e promo. | V | pagina |

**Da riusare**: `isPushSupported`, `isIosNonPwa` (standalone già rilevato), `resolvePushStatus`, `shouldShowNotificationGate` (logica anti-loop), RPC claim (riassegnazione endpoint), SW (aggiungere solo campi al payload), Edge Function (modello di dedup e pulizia).
**Da aggiungere**: icone PNG, gestione `beforeinstallprompt`/`appinstalled`, guida per browser, categorie e preferenze, registro invii, riassociazione push al cambio uid, aggiornamento `last_seen_at`.

---

## 2. Percorsi (P)

### 2.1 Rilevamento ambiente (funzione pura `resolveInstallInvite`, con test)
Ingressi: piattaforma, browser, `standalone`, `bipAvailable`, permesso notifiche, `subscribed`, iscritto sì/no, contesto
(`join` | `tessera` | `status` | `checkout`), "non ora" con data.

| Ambiente | Riconoscimento | Cosa mostriamo |
|---|---|---|
| iPhone Safari | UA iOS + non standalone + non in-app | Guida 3 passi: **Condividi** ↑ → **Aggiungi alla schermata Home** → **Aggiungi** |
| iPhone Chrome / Edge / Firefox | UA `CriOS`/`EdgiOS`/`FxiOS` | Guida col tasto condividi del browser (Chrome: in alto a destra). Se la voce non c'è: "Apri questa pagina in Safari" + COPIA LINK |
| iPhone in-app (Instagram, Facebook, TikTok…) | UA `Instagram`/`FBAN`/`FBAV`… | "Da qui non si può installare": apri in Safari (menu ⋯ → Apri nel browser) + COPIA LINK |
| iOS < 16.4 | versione da UA | Installazione possibile, notifiche **no**: "aggiorna iOS per gli avvisi". Nessun pulsante notifiche |
| Android con `beforeinstallprompt` | evento catturato all'avvio | Pulsante **INSTALLA WALBOX** → `prompt()` vero del browser |
| Android senza evento (Firefox, Samsung senza evento, Chrome con criteri non soddisfatti) | nessun evento entro il caricamento | Istruzioni: menu ⋮ → **Installa app** / **Aggiungi a schermata Home** |
| Android in-app | UA | "Apri in Chrome" + COPIA LINK |
| Già installata (standalone) | `display-mode: standalone` / `navigator.standalone` | Nessun invito all'installazione: si passa alle notifiche |
| Installata ma aperta dal browser | flag locale da `appinstalled`, o nessun modo certo (D) | Riga piccola "Già installata? Aprila dall'icona sulla Home" al posto della CTA |
| Desktop | — | Nessun invito (non è il target) |

Mai un finto pulsante "Installa" dove il browser non lo permette: su iPhone e senza evento la CTA apre **solo** le istruzioni.

### 2.2 iPhone
1. **Installa** — card poster «IL WALRUS SEMPRE IN TASCA» · «Aggiungi Walbox alla schermata Home. Ordini più velocemente e
   non perdi i tuoi premi.» · CTA «COME SI INSTALLA» → foglio con i passi del browser rilevato. Link "Non ora" (ripropone
   dopo 14 giorni, max 3 volte).
2. **Apri dalla Home** — nella guida, ultimo passo: "Ora chiudi Safari e apri Walbox dall'icona". La PWA si apre su
   `/kitchen?src=home` (start_url), riconosce lo standalone.
3. **Ritrova la tessera** (iPhone: la PWA può avere un archivio separato da Safari, quindi **assumiamo sessione nuova**):
   prima apertura in standalone senza tessera → schermata «BENTORNATO AL WALRUS» · "Hai già la tessera? Entra col tuo
   numero" → OTP (flusso F3, `signInWithOtp` + `verifyOtp sms`) → stesso uid → tessera, timbri e buoni intatti.
   Alternativa "Non ho la tessera" → menu. Gli ordini restano sul server: nulla si perde, si cambia solo la sessione.
4. **Attiva notifiche** — card «NON PERDERTI I TUOI 5 €» · «Ti avvisiamo quando sblocchi un premio o quando sta per
   scadere.» · CTA «ATTIVA NOTIFICHE» → **solo qui** `Notification.requestPermission()` (gesto esplicito). Poi claim
   sull'uid del membro.
   Testo adattato (P): con buono già pronto «NON PERDERTI I TUOI 5 €»; con 0-1 timbri «IL TUO PREMIO TI ASPETTA» (il
   titolo originale promette 5 € che ancora non ci sono — **NEEDS_DECISION D-20**).

### 2.3 Android
- Con evento: «IL WALRUS SEMPRE IN TASCA» + **INSTALLA WALBOX** → finestra del browser. Esito `accepted` → "Fatto! Apri
  Walbox dalla Home" e subito dopo la card notifiche (su Android la push funziona anche senza installare: la card
  notifiche può comparire anche se l'utente rifiuta l'installazione). Esito `dismissed` → "Non ora" (14 giorni).
- Senza evento: istruzioni dal menu del browser, oppure si salta direttamente alle notifiche.
- Su Android la PWA condivide l'archivio con Chrome (D): la sessione resta, nessun nuovo accesso necessario.

### 2.4 Permesso negato / stati notifiche
- `denied`: mai più `requestPermission()` (il browser non lo mostrerebbe comunque). Card informativa una sola volta:
  iPhone "Impostazioni → Notifiche → Walbox", Android "lucchetto/ⓘ → Notifiche → Consenti". Poi solo la riga nelle
  Preferenze.
- `default` + "Non ora": riproposta al massimo dopo 14 giorni e solo nei momenti del §3.
- Già attive: riga "🔔 Notifiche attive su questo telefono" + link Preferenze, nessuna card.

---

## 3. Dove mostrare gli inviti (P)

Regola: **un solo invito per schermata e per visita**, mai insieme a iscrizione, pagamento o OTP. Ordine di priorità:
pagamento > avviso ordine pronto > iscrizione > installazione > notifiche Club.

| Momento | Cosa | Cosa NON si mostra |
|---|---|---|
| Menu, sacco, checkout, SumUp, OTP | Niente | Nessun invito (il checkout ha la priorità) |
| Benvenuto dopo l'iscrizione (`join3`) | Sotto la CTA principale: card installazione (se non standalone) **oppure** card notifiche (se standalone/Android) | L'overlay notifiche ordine |
| Tessera | Card in fondo al blocco progresso, finché non installata/attivata o "Non ora" | — |
| Stato ordine **pagato** con timbro o buono | Nella card Club già esistente, riga «Avvisami quando sblocco il premio» (iPhone non installato → apre la guida) | Se l'overlay "ordine pronto" è già comparso per questo ordine, niente di più |
| Stato ordine in attesa di pagamento | Solo l'overlay attuale "ordine pronto" (servizio) | Inviti Club |
| Prima apertura dalla Home | «Bentornato» + accesso tessera, poi notifiche | Installazione |

Sull'iPhone non installato l'attuale gate "TI AVVISIAMO NOI" sullo stato ordine va **unificato** con la nuova guida
(stesso foglio di istruzioni), invece di due messaggi diversi.

---

## 4. Notifiche Food Club (P, da realizzare solo in F6)

### 4.1 Tre categorie separate
| Categoria | Esempi | Base | Interruttore |
|---|---|---|---|
| **Servizio ordine** | "Il tuo ordine è pronto" | richiesta del cliente sull'ordine (esistente) | permesso del dispositivo (come oggi) |
| **Tessera e premi** | timbro, buono sbloccato, buono in scadenza | servizio del programma a cui si è iscritto (**D-18**, da validare col legale) | "Avvisi tessera e premi", acceso solo col tocco su ATTIVA NOTIFICHE |
| **Promozioni** | promo riservata, invito a tornare | **consenso marketing** con data/ora (già nel modulo d'iscrizione) | "Promo e novità", spento di default |

Il server decide per categoria: nessun invio promo senza `marketing_consent_at` valido e non revocato **al momento
dell'invio**. Le sottoscrizioni attivate col vecchio testo ("niente pubblicità") ricevono solo il servizio ordine.

### 4.2 Testi (bozza)
| Evento | Titolo | Corpo | Apre | Limite |
|---|---|---|---|---|
| Primo timbro | +1 TIMBRO 🦭 | Visita contata. Torna entro il {data} e sblocchi 5 €. | `/kitchen/club/tessera` | 1 per timbro |
| 2° timbro / buono | 5 € SBLOCCATI | Il tuo buono è pronto fino al {data}. Lo usi sul prossimo ordine con 12 € di food. | `/kitchen/club/buoni` | 1 per buono |
| Buono in scadenza | IL TUO BUONO SCADE {giorno} | 5 € ancora tuoi fino a {data}. | buoni | 1 sola volta, 3 giorni prima, 17:00-20:00 |
| Promo riservata | {titolo promo} | {testo, max 90 caratteri} | pagina promo | max 1 ogni 7 giorni, 2 al mese |
| Ritorno dopo inattività | CI MANCHI AL WALRUS | Il tuo prossimo timbro è a un ordine di distanza. | menu | 1 dopo 21 giorni senza visite, poi non prima di 60 giorni |

Regole comuni: fascia silenziosa 22:30-10:00 (tranne servizio ordine e timbro, che seguono un pagamento appena fatto);
massimo 1 notifica Club al giorno; deduplica con chiave unica (membro, tipo, riferimento); `tag` per tipo così una
notifica nuova sostituisce la vecchia; mai notifiche promo nella stessa ora di un ordine. Ogni notifica è anche in
"Messaggi" dentro l'app (fonte di verità = app, la push è solo un effetto collaterale, come per gli ordini).

### 4.3 Preferenze e revoca
Pagina Preferenze: tre righe (Ordini · Tessera e premi · Promo e novità) + stato del permesso del dispositivo +
"Disattiva su questo telefono" (riusa `deactivate()`). Revoca del marketing con data/ora salvata; effetto immediato sul
server. Link all'informativa aggiornata.

---

## 5. Identità e dispositivi (P, sviluppa §3 di F0)

1. Tessera = telefono verificato (D-6 chiusa). Ogni dispositivo entra con OTP e ottiene **lo stesso uid**.
2. PWA iOS = dispositivo nuovo. Prima apertura standalone senza sessione membro → accesso con numero (§2.2 p.3). Se la
   PWA ha già un anonimo con ordini (caso raro: ha ordinato prima di accedere) → biglietto di unione di F0 (legato
   all'hash del numero, P4 ancora da provare).
3. **Push per dispositivo**: dopo ogni cambio di uid (`SIGNED_IN` con uid diverso) e a ogni apertura, se il permesso è
   `granted`, il client richiama il claim → la riga passa al membro e `last_seen_at` si aggiorna (risolve A10 e A11).
   L'endpoint è unico per dispositivo/browser: Safari e PWA sullo stesso iPhone hanno endpoint diversi (D).
4. "Esci da questo telefono": `deactivate()` + signOut, così la push non arriva a chi usa il telefono dopo.
5. Costo: ogni accesso da un nuovo dispositivo = 1 SMS (~0,09 $). Alternativa senza SMS (codice di passaggio da Safari
   alla PWA) → **D-17**, sconsigliata in V1 (serve emettere sessioni lato server, superficie d'attacco nuova).

---

## 6. Misurazione (P)

| Indicatore | Come | Tipo |
|---|---|---|
| Iscritti che vedono l'invito | evento `invite_shown` (membro, contesto, piattaforma), 1 per giorno | osservato |
| Clic su COME SI INSTALLA / INSTALLA | `install_cta_click` | osservato |
| Install Android | `beforeinstallprompt` → `userChoice accepted` + `appinstalled` | osservato |
| Install iPhone | **non misurabile**: si usa la prima apertura standalone del membro (`first_standalone_open`) | stima per difetto (chi installa e non apre non si vede) |
| Notifiche attivate | esito del permesso + claim riuscito, per categoria | osservato |
| Notifiche inviate | registro invii (tipo, esito HTTP del push service) | osservato (accettata dal servizio ≠ vista) |
| Notifiche aperte | `notificationclick` → URL con `?n=<id>` → `opened_at` | osservato (iOS può non riportare alcuni click, D) |
| Ritorni dopo notifica | ordine pagato entro 72 h da un'**apertura** = "ritorno assistito"; entro 7 gg dall'invio senza apertura = "correlato" | correlazione, **non** effetto |
| Effetto vero delle promo | gruppo di controllo: 10% degli idonei non riceve la promo; confronto tassi di ritorno | stima causale (**D-21**) |

Nessuno strumento di analytics esterno; eventi legati all'uid del membro, conservazione allineata alla retention.
Nei report: colonne "osservato" e "stima" separate; nessun ritorno attribuito alla notifica senza apertura o controllo.

---

## 7. Piano d'integrazione con Food Club V1 (da approvare, nessuna fase avviata)

| Passo | Dove nel piano V1 | Contenuto | File (P) | Aree protette |
|---|---|---|---|---|
| I-1 | F1 (base dati) | Tabelle `food_club_notification_prefs` (tessera, promo + date) e `food_club_notification_log` (unique membro/tipo/rif, inviata, aperta); RPC "touch" della sottoscrizione; eventi di misura | migration | **sì** (migration) |
| I-2 | F3 (identità) | Riclaim push al cambio uid; schermata "Bentornato, entra col numero" in standalone; "Esci da questo telefono" | `useWebPushSubscription.js`, `useKitchenOrders.js` (P5), nuova pagina Club | Auth: config sì |
| I-3 | F4 (cliente) | `src/lib/installInvite.js` (+test), `useInstallState` (cattura `beforeinstallprompt` all'avvio), `InstallGuideSheet.jsx`, `ClubPushCard.jsx`, righe preferenze; unificare il gate iOS di `NotificationOptIn` | `src/lib`, `src/hooks`, `src/components/kitchen` | no (routing `/kitchen/club` già previsto come [P]) |
| I-4 | F4 | Manifest: icone PNG 192/512 + maskable, `id`, `start_url /kitchen?src=home`; registrazione SW all'avvio (senza `fetch`) | `public/`, `index.html`, `main.jsx` | da confermare (deploy) |
| I-5 | F6 (notifiche) | Funzione `send-food-club-push` (stesso modello di dedup/pulizia), coda eventi dalle RPC di F2, job giornaliero scadenze/inattività con limiti | `supabase/functions/…`, cron | **sì** |
| I-6 | F7 | Viste aggregate del §6 | migration viste | **sì** |
| I-7 | Prima di F6 | Prova reale su iPhone e Android della push "ordine pronto" esistente (A9 mai verificata) | — | gate Eros |

Ordine: I-7 può essere fatta subito (è solo una prova); I-1 con F1, I-2 con F3, I-3/I-4 con F4, I-5 con F6, I-6 con F7.

---

## 8. Rischi e decisioni aperte

**Rischi**
- R1 Push "ordine pronto" mai provata su telefono, VAPID non verificate (A9): tutta la parte notifiche poggia su questo.
- R2 iPhone: push solo con app installata e iOS ≥ 16.4; se il cliente cancella l'icona la sottoscrizione muore in
  silenzio (pulizia solo al prossimo invio, 404/410).
- R3 Archivio separato Safari/PWA su iPhone: senza la schermata "entra col numero" il cliente vedrebbe una tessera
  vuota e penserebbe di aver perso i premi.
- R4 Retention 180 giorni su `last_seen_at` mai aggiornato (A10): da correggere prima del lancio.
- R5 Sottoscrizioni esistenti con promessa "niente pubblicità" (A7): mai usarle per promo.
- R6 Android: con la sola icona SVG l'installazione automatica potrebbe non comparire (A3, da provare).
- R7 Telefono condiviso/ceduto: notifiche della tessera a un'altra persona → "Esci da questo telefono".
- R8 Costo SMS per ogni nuovo dispositivo (PWA iPhone = +1 SMS per iscritto che installa). Resta aperto anche P1 di F0
  ("Confirm phone" in produzione), bloccante per tutta l'identità.
- R9 Politiche Apple sulle PWA in UE: oggi funzionano (D), ma sono un fattore esterno non controllabile.

**Decisioni (NEEDS_DECISION, Eros)**
- **D-17** Accesso nella PWA iPhone: nuovo OTP SMS (P, consigliato) o codice di passaggio senza SMS.
- **D-18** Notifiche tessera/premi: interruttore proprio acceso dal tocco ATTIVA NOTIFICHE (P) — da validare col
  legale insieme a D-11.
- **D-19** Limiti di frequenza e fascia silenziosa del §4.2 (valori proposti).
- **D-20** Titolo «NON PERDERTI I TUOI 5 €» anche quando il buono non c'è ancora, o variante per stato (P).
- **D-21** Gruppo di controllo 10% per le promo (sì/no).
- **D-22** Nome sotto l'icona sulla Home: "Walbox Kitchen" (attuale, tagliato su iPhone in "Walbox Kitc…", D) o
  "Walrus" / "Walbox".

Modello/effort: I-3/I-4 (UI) a subagent Sonnet medium; I-1, I-2, I-5 (dati, identità, invii) in sessione principale
con `/effort high`.
