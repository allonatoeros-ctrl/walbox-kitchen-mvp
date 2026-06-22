# Checkpoint: Walbox V2 Brand Baseline

Questo checkpoint documenta lo stato stabile e testato di **Walbox V2** prima di procedere con la brandizzazione visiva dedicata a **Walrus Pub**. 

---

## 1. Data e Info Baseline
* **Data:** 4 Giugno 2026
* **Nome Baseline (Tag Git):** `v2-brand-baseline`
* **Stato Git:** Tag locale creato con successo. Build di produzione (`npm run build`) verificata e funzionante.

---

## 2. Stato Stabile Attuale
L'applicazione **Walbox V2** è sviluppata su stack React + Vite + Vanilla CSS. Funziona interamente in locale e sincronizza lo stato in tempo reale tra le diverse schermate aperte nello stesso browser/dispositivo tramite il meccanismo di sincronizzazione di `localStorage`. Il comportamento complessivo è **QA SAFE** ed esente da regressioni logiche.

---

## 3. Feature Incluse e Mappate

### A. Flusso Client (Mobile-First)
* **Customer Entry (`/entry` o `/`):** Schermata di benvenuto mobile-first per l'inserimento del nome utente. Impedisce lo zoom automatico dei campi di testo su iOS.
* **Customer Request (`/request`):** Pannello principale del cliente per cercare brani, votare e richiedere la riproduzione su TV. Include:
  * Ricerca e accodamento tracce (con catalogo mock).
  * Gestione dei crediti (Walbox Credits).
  * **LOOK UP! Mobile Alert:** Banner animato che invita il cliente a guardare lo schermo TV in momenti salienti.
  * **Story Canvas (Instagram-ready):** Interfaccia per catturare graficamente il momento "Now Playing" o "Takeover" per la condivisione social.

### B. Flusso Gestione (Desktop)
* **Staff Dashboard (`/staff`):** Pannello di amministrazione per il controllo dei brani in coda e la moderazione delle richieste. Include:
  * **Hype Trigger / Staff Reaction Moment:** Pulsanti dedicati per lanciare overlay animati temporanei sullo schermo TV (es. *"CRAZY NIGHT!"*, *"DRINK UP!"*, ecc.).

### C. Display Pubblico (16:9 Cinema TV-First)
* **Live TV Screen (`/tv`):** Schermata principale per la TV del locale, ottimizzata per la fruizione a distanza.
  * Visualizzazione del brano in riproduzione ("Now Playing") con animazione dell'equalizzatore.
  * Effetto Takeover a tutto schermo per l'attivazione dei brani richiesti.
  * Coda laterale dei prossimi brani e ticker scorrevole.
  * Ricezione immediata degli alert e degli Hype Trigger dello staff.

---

## 4. File e Documenti Brand Aggiunti
I seguenti file e asset preparatori sono stati organizzati e memorizzati:
* **Documenti di Brand (in [docs/brand/](file:///Users/erosallonato/Desktop/walbox-from-zero-v2/docs/brand/)):**
  1. [WALRUS_BRAND_CONTEXT.md](file:///Users/erosallonato/Desktop/walbox-from-zero-v2/docs/brand/WALRUS_BRAND_CONTEXT.md): Contesto narrativo, tono di voce ed elementi chiave del pub Walrus.
  2. [WALRUS_BRAND_REFERENCE_PACK.md](file:///Users/erosallonato/Desktop/walbox-from-zero-v2/docs/brand/WALRUS_BRAND_REFERENCE_PACK.md): Palette di colori ipotizzate, abbinamenti tipografici e regole visive.
  3. [WALRUS_VISUAL_BRAND_REVIEW.md](file:///Users/erosallonato/Desktop/walbox-from-zero-v2/docs/brand/WALRUS_VISUAL_BRAND_REVIEW.md): Analisi critica dell'interfaccia corrente rispetto al posizionamento visivo desiderato per Walrus Pub.
* **Asset di Riferimento (in [references/walrus-brand/](file:///Users/erosallonato/Desktop/walbox-from-zero-v2/references/walrus-brand/)):**
  * Immagini reali organizzate nelle sottocartelle:
    * `/01_logo_signage`
    * `/02_interior_materials`
    * `/03_menu_drink_beer`
    * `/99_sources`

---

## 5. Test Effettuati (QA Safe Status)
* **Build di Produzione:** Eseguita con successo senza errori di compilazione o warning fatali (`dist/` generata correttamente).
* **Smoke Test Interattivo:** 
  1. Apertura simultanea di `/staff`, `/request` e `/tv` in finestre affiancate dello stesso browser.
  2. Invio di una richiesta di canzone da `/request` $\rightarrow$ verifica dell'inserimento in coda visibile in tempo reale su `/staff` e `/tv`.
  3. Approvazione staff $\rightarrow$ avvio corretto del Takeover visivo su `/tv`.
  4. Pressione del pulsante "LOOK UP!" $\rightarrow$ ricezione del banner animato sul client mobile e trigger dell'Instagram Story Canvas.
  5. Trigger di una reazione dello staff da `/staff` $\rightarrow$ comparsa dell'overlay emotivo immediato su `/tv`.
* **Mobile Layout Verification:** Navigazione simulata da iPhone/Android per escludere scrolling orizzontale o zoom indesiderati.

---

## 6. Limiti Noti
* **Sincronizzazione di Stato:** Avviene esclusivamente tramite l'evento `storage` di `localStorage`. Questo comporta che i test multi-dispositivo reali (es. telefono reale + schermo TV separato) richiedono una LAN comune ed eventualmente una configurazione specchio, oppure non si sincronizzeranno se non sullo stesso client/browser logico.
* **Persistenza:** Al ricaricamento totale o alla pulizia della cache del browser, lo stato del jukebox viene ripristinato ai dati mock di default.

---

## 7. Cosa NON Toccare
Nelle fasi successive di brandizzazione estetica, **non devono essere alterati**:
* Il sistema di messaggistica e sincronizzazione basato su `localStorage` in React.
* I flussi logici di instradamento (le rotte definite in `src/App.jsx` o componente equivalente).
* Le proprietà dei dati dei brani e la logica dei crediti/code.
* La struttura semantica dei tag HTML dedicati ai test o all'accessibilità.

---

## 8. Perché questa Baseline è Importante
Questa baseline rappresenta la **fondazione funzionale definitiva**. Avendo isolato e verificato tutta la logica applicativa, lo sviluppo futuro si concentrerà esclusivamente sulla veste grafica (CSS, colori, font, bordi, ombre, layout visivi) senza rischiare di rompere il comportamento di sincronizzazione in tempo reale e il flusso dell'utente. In caso di problemi di rendering o bug visivi, è possibile fare un diff pulito rispetto a questo tag `v2-brand-baseline`.

---

## 9. Prossimo Step Singolo
* Avviare la riscrittura del foglio di stile globale (`src/index.css`) per importare la tipografia corretta (Google Fonts prescelti per Walrus) e configurare le variabili CSS (custom properties) della palette cromatica Walrus (ispirata ai toni scuri del legno, verde bosco, oro dell'ottone e della birra, e arancione ambrato).

---

## 10. Prompt per ripartire con il Creative Director

Copia e incolla il seguente prompt all'avvio della prossima sessione per allineare immediatamente l'AI nel ruolo di Creative Director:

```text
Agisci come Creative Director & Lead UI Engineer per Walbox V2.

Abbiamo appena salvato una baseline stabile dell'applicazione (tag 'v2-brand-baseline'). La logica applicativa (sincronizzazione localStorage, code, Hype Triggers, Lookout alerts) è QA SAFE e NON deve essere modificata.

Il tuo compito ora è guidare la brandizzazione visiva completa dell'app per farla rispecchiare l'identità di "Walrus Pub", basandoti sui seguenti file di riferimento:
- docs/brand/WALRUS_BRAND_CONTEXT.md
- docs/brand/WALRUS_BRAND_REFERENCE_PACK.md
- docs/brand/WALRUS_VISUAL_BRAND_REVIEW.md
- Asset grafici in references/walrus-brand/

Inizia presentandomi una proposta strutturata di palette colori (variabili CSS da inserire in src/index.css) e le scelte tipografiche (Google Fonts), spiegando come intendiamo differenziare visivamente le 3 interfacce principali:
1. Mobile Client (/entry, /request) - Caldo, avvolgente, stile menu di un pub tradizionale ma fluido e moderno.
2. Staff Dashboard (/staff) - Pulito, scuro, ad alto contrasto per uso rapido dietro al bancone.
3. Live TV Screen (/tv) - Cinematico, premium, immersivo con richiami all'ottone, legno scuro e neon ambrati del pub.

Non modificare ancora il codice. Proponi prima il piano d'azione stilistico.
```
