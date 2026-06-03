# Checkpoint Feature: LOOK UP! Mobile Alert & Instagram Story Canvas
**Data**: 2026-06-03

---

## 1. Obiettivo della Feature
L'obiettivo principale è colmare il gap di attenzione tra l'utente sul proprio smartphone e il maxischermo del locale. Quando la canzone richiesta da uno specifico tavolo passa allo stato `playing` (in onda), sul dispositivo del cliente si attiva un overlay immersivo ("LOOK UP! 📺") che lo invita ad alzare lo sguardo verso la TV del locale e gli offre una cartolina digitale ("Instagram Story Canvas") ad alta fedeltà con i dettagli del brano, della dedica e del tavolo, formattata per essere facilmente catturata via screenshot e condivisa sui social.

---

## 2. Perché è importante per Walbox
* **Connessione Mobile → TV**: Crea un ponte visivo e interattivo immediato che spinge l'utente a interagire con l'ambiente fisico circostante.
* **Social Sharing & Virilità**: Ottimizzando la grafica come una "Instagram Story", incoraggia la condivisione spontanea dei momenti da parte dei clienti taggando il locale, generando pubblicità gratuita e organica per Walbox.
* **User Engagement**: Incrementa il senso di gratificazione del cliente nel vedere la propria dedica "celebrata" sia sul proprio telefono sia sullo schermo principale del locale.

---

## 3. Workflow Agentico Usato
1. **Venue Experience Strategist Agent**: Ha analizzato e identificato il gap di esperienza fisica in cui il cliente mobile rimaneva focalizzato esclusivamente sul proprio schermo senza accorgersi della messa in onda sulla TV.
2. **Creative Director Agent**: Ha redatto il brief contenente le linee guida per la UI, il copy promozionale, la palette di colori dipendente dal mood e le animazioni del brand.
3. **Frontend Agent**: Ha implementato la logica del monitoraggio di stato, l'overlay dinamico e il relativo foglio di stile CSS.
4. **QA Agent**: Ha testato e certificato l'assenza di regressioni fornendo verdetto `SAFE`.
5. **Commit & Build**: Il codice è stato verificato con `npm run build` e committato con successo.

---

## 4. File Modificati
* **[src/pages/CustomerRequest.jsx](file:///Users/erosallonato/Desktop/walbox-from-zero-v2/src/pages/CustomerRequest.jsx)**: Aggiunto monitoraggio dello stato `playing` con `useRef` e `useEffect`, integrazione dell'overlay `look-up-overlay` e dello `story-canvas` brandizzato con gestione della chiusura.
* **[src/pages/LiveTvScreen.jsx](file:///Users/erosallonato/Desktop/walbox-from-zero-v2/src/pages/LiveTvScreen.jsx)**: Aggiunto invito social (`.tv-takeover-social`) nella schermata di takeover televisivo per stimolare il tag `@WalboxVenue`.
* **[src/index.css](file:///Users/erosallonato/Desktop/walbox-from-zero-v2/src/index.css)**: Implementazione di stili CSS per l'overlay (glassmorphism con blur, gradient radiali di sfondo basati sul mood, card in formato 9:16 Instagram Story) e animazioni di ingresso elastico (`lookUpSlideUpBounce`).

---

## 5. Cosa Funziona
* **Rilevamento in tempo reale**: Quando una richiesta effettuata dallo stesso client/tavolo passa a `playing`, scatta immediatamente l'alert.
* **Design Premium & Dinamico**: Lo sfondo dell'overlay genera un alone radiale sfumato corrispondente al colore del mood della traccia in esecuzione.
* **Cartolina Social condivisibile**: Lo Story Canvas riproduce fedelmente una grafica Instagram con informazioni del tavolo, titolo, artista, dedica tra virgolette, geolocalizzazione ed etichetta del mood del pezzo.
* **Invito Social su TV**: Durante il takeover della TV viene visualizzato l'invito a condividere e taggare.

---

## 6. Test Effettuati
* Esecuzione di `npm run build` completata con successo (0 errori, 0 avvisi).
* Test del ciclo di vita dello stato `playing` tramite sincronizzazione di `localStorage`.
* Simulazione di visualizzazione mobile ed esportazione visiva dei componenti.

---

## 7. QA Verdict
**SAFE**  
La feature è stata implementata in modo isolato ed estende le pagine esistenti senza alterare o interrompere i flussi base di richiesta, approvazione staff o visualizzazione del player TV.

---

## 8. Rischi Residui
* **Saturazione Viewport**: Su schermi con altezza molto ridotta (es. vecchi modelli di smartphone), il formato verticale 9:16 della cartolina potrebbe richiedere scrolling o fuoriuscire leggermente dall'area visibile.
* **Dipendenza dal loop locale**: L'alert si basa sul monitoraggio in tempo reale del localStorage; eventuali blocchi o ritardi nella propagazione degli eventi tra tab influenzeranno la tempistica di comparsa dell'alert.

---

## 9. Cosa NON Toccare
* La logica di sincronizzazione generale (`subscribeState`) e il caricamento del tavolo tramite parametri URL in `CustomerRequest.jsx`.
* Le animazioni del player principale e del vinile 3D su `LiveTvScreen.jsx`.

---

## 10. Prossimo Step Singolo
* Ottimizzare la responsività verticale dell'overlay LOOK UP! per schermi mobili a bassa risoluzione, introducendo una scala flessibile (`transform: scale` o percentuali fluide) per garantire che l'intero canvas e il bottone di chiusura rimangano visibili all'interno della viewport senza scroll verticale.

---

## 11. Prompt per ripartire
> "Riapri la feature LOOK UP! appena completata in `CHECKPOINT_LOOK_UP_FEATURE.md`. Senza modificare la logica di business o i flussi di sincronizzazione esistenti, modifica `src/index.css` e se necessario `src/pages/CustomerRequest.jsx` per ottimizzare il layout dell'overlay `look-up-overlay` e della card `story-canvas` in modo che si adattino fluidamente a schermi con altezza ridotta (es. iPhone SE), garantendo che l'interfaccia sia interamente visibile nella viewport del dispositivo mobile."
