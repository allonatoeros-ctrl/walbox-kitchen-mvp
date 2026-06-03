# Checkpoint Feature: Staff Reaction Moment / Hype Trigger
**Data**: 2026-06-03

---

## 1. Obiettivo della Feature
L'obiettivo di questa feature è permettere allo staff del locale di interagire in tempo reale con l'atmosfera della sala attivando "Hype Triggers" (Reaction Moments) direttamente dalla Staff Dashboard. Quando lo staff attiva uno dei tre trigger (Hype Moment, Party Vibe, Cheers), la Live TV mostra immediatamente un overlay animato a schermo intero della durata di 6 secondi con messaggi ad alto impatto visivo e particellari dedicati, catturando l'attenzione della sala nei momenti chiave dell'esperienza fisica.

---

## 2. Perché è importante per Walbox
* **Coinvolgimento Fisico & Climax**: Consente al personale del locale di amplificare l'energia della sala in tempo reale (es. durante un brindisi collettivo, l'arrivo di una bottiglia o un momento di picco della serata).
* **Controllo in Tempo Reale**: Offre allo staff uno strumento di regia immediato, semplice ed efficace per personalizzare l'esperienza visuale a seconda del mood della serata.
* **Gamification e Intrattenimento**: Alterna la visualizzazione standard delle dediche con momenti di rottura visiva spettacolari, aumentando l'attrattiva della Live TV per i clienti presenti.

---

## 3. Workflow Agentico Usato
1. **Venue Experience Strategist Agent**: Ha definito e selezionato il concept strategico del "Staff Reaction Moment" per arricchire l'interattività e l'intrattenimento all'interno del locale.
2. **Creative Director Agent**: Ha redatto le specifiche estetiche, i testi e le logiche di movimento e animazione (es. particelle per ciascun mood).
3. **Frontend Agent**: Ha implementato i componenti interattivi nella dashboard staff, la sincronizzazione in `localStorage` dell'evento e la visualizzazione dell'overlay a schermo intero con le animazioni particellari e il mascheramento del ticker.
4. **QA Agent**: Ha testato e validato la stabilità, dichiarando la feature **SAFE** ed esente da regressioni.
5. **Commit & Build**: Il codice è stato verificato con `npm run build` e committato con successo.

---

## 4. File Modificati
* **[src/pages/StaffDashboard.jsx](file:///Users/erosallonato/Desktop/walbox-from-zero-v2/src/pages/StaffDashboard.jsx)**:
  * Aggiunto il pannello interattivo "Hype Trigger ⚡" con tre bottoni dedicati (*Hype Moment*, *Party Vibe*, *Cheers!*).
  * Implementata la scrittura dell'evento `walbox_tv_reaction` nel `localStorage`.
  * Integrato un sistema di cooldown di 15 secondi con disabilitazione dei bottoni e barra di progresso visuale per evitare abusi da parte dello staff.
* **[src/pages/LiveTvScreen.jsx](file:///Users/erosallonato/Desktop/walbox-from-zero-v2/src/pages/LiveTvScreen.jsx)**:
  * Aggiunto il monitoraggio dello stato `walbox_tv_reaction` in tempo reale tramite listener dell'evento di storage.
  * Creato l'overlay a schermo intero (`.tv-reaction-overlay`) che si attiva per 6 secondi con titoli e sottotitoli personalizzati per tipo di reaction.
  * Aggiunta la classe dinamica `.tv-has-reaction` per manipolare il layout della Live TV (nascondendo temporaneamente il ticker inferiore).
* **[src/index.css](file:///Users/erosallonato/Desktop/walbox-from-zero-v2/src/index.css)**:
  * Definiti gli stili dei bottoni della dashboard, della barra di cooldown e dell'overlay fullscreen con glassmorphism (`backdrop-filter: blur(25px)`).
  * Creato il sistema di particelle animate differenziato per ciascuna reaction:
    * **Hype Moment**: fiamme/braci ascendenti (`hypeEmber`) in gradiente arancione/fucsia.
    * **Party Vibe**: coriandoli cadenti multicolore (`partyConfetti`) ruotanti.
    * **Cheers!**: bollicine trasparenti ascendenti (`cheersBubble`) stile champagne.
  * Implementato l'effetto di comparsa sfumata (`reactionFadeIn`) e pulsazione del testo (`reactionPulse`).

---

## 5. Cosa Funziona
* **Trigger e Sincronizzazione**: Cliccando su un bottone dello staff, l'evento viene salvato localmente e la Live TV risponde istantaneamente mostrando l'effetto.
* **Overlay di 6 Secondi**: L'overlay sparisce automaticamente dopo 6 secondi reimpostando lo stato.
* **Gestione Cooldown**: Lo staff non può premere ripetutamente i bottoni grazie a un cooldown bloccante di 15 secondi, segnalato da una barra animata.
* **Nascondimento Ticker**: Il ticker scorrevole delle dediche scompare dolcemente per tutta la durata dell'overlay per ottimizzare l'attenzione e non creare sovrapposizioni visive.
* **Particelle Animate**: 15 elementi particellari dinamici con posizioni e ritardi di animazione casualizzati simulano l'effetto desiderato (braci, coriandoli, bolle).

---

## 6. Test Effettuati
* Esecuzione di `npm run build` completata con successo (0 errori, 0 avvisi).
* Test di sincronizzazione cross-window tramite eventi di `localStorage` per garantire che l'azione sulla Staff Dashboard influenzi immediatamente lo schermo della Live TV.
* Validazione visiva del cooldown e del comportamento dell'overlay su risoluzioni desktop e TV (16:9).

---

## 7. QA Verdict
**SAFE**  
La feature è stata implementata in modalità non invasiva. Non interferisce con il player musicale, la coda dei brani o i timer interni dell'app.

---

## 8. Rischi Residui
* **Desincronizzazione Browser**: In ambienti con limitazioni severe su `localStorage` o in assenza di focus sulla finestra della Live TV in determinati browser, l'evento di storage potrebbe subire leggeri ritardi.
* **Sovrapposizione Audio/Video**: Se viene attivato durante un Takeover di un nuovo brano, l'overlay si sovrappone graficamente, ma la transizione audio/video non viene interrotta o corrotta.

---

## 9. Cosa NON Toccare
* Il modulo `mockData.js`, la gestione dello stato principale del player musicale e le code dei brani in `App.jsx`.
* I timer di riproduzione e le logiche di scorrimento delle tracce nella coda globale.

---

## 10. Prossimo Step Singolo
* Integrare un controllo di priorità visiva in `src/pages/LiveTvScreen.jsx` affinché, qualora un Hype Trigger venga attivato contemporaneamente all'inizio del Takeover di una canzone (Takeover Screen), l'animazione di reaction dello staff attenda il completamento della schermata di Takeover musicale prima di mostrarsi, oppure si integri visivamente in modo armonico senza coprire le info del brano in arrivo.

---

## 11. Prompt per ripartire
> "Riapri la feature Staff Reaction Moment completata in `CHECKPOINT_STAFF_REACTION_FEATURE.md`. Modifica `src/pages/LiveTvScreen.jsx` in modo da coordinare temporalmente l'apparizione dell'overlay dell'Hype Trigger (`tvReaction`) con lo stato del Takeover del brano (`showTakeover`). Fai sì che l'Hype Trigger non si sovrapponga in modo disordinato alla schermata di Takeover musicale, dando la priorità visiva al Takeover del brano prima di far partire il countdown di 6 secondi della reaction."
