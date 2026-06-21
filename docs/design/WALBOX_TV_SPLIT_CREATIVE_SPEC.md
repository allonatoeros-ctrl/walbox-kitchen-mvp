# WALBOX TV SPLIT CREATIVE SPEC

## 1. Scopo del documento
Questa spec definisce la direzione creativa e le regole operative per separare e progettare le due TV pubbliche Walbox: **Jukebox TV** e **Kitchen TV**. Le due schermate dovranno funzionare visivamente come "sorelle", avendo un'estetica condivisa ma mantenendo scopi e layout gerarchici nettamente distinti. L'obiettivo è evitare la creazione di una singola schermata confusa (dashboard style) che tenti di fare tutto contemporaneamente.

## 2. Decisione prodotto
Walbox offrirà due esperienze TV separate, ideate per le diverse esigenze fisiche del locale:
- Un focus sull'**intrattenimento, atmosfera e musica** (Jukebox).
- Un focus sul **servizio, ritiro ordini e cross-selling** (Kitchen).
Questa separazione garantisce massima leggibilità da lontano e una comprensione immediata in 3–5 secondi.

## 3. Walrus Visual DNA condiviso
Entrambe le TV ereditano la stessa identità visiva di base:
- **Dark grunge:** Sfondi scuri, contrasti netti, leggere texture sporche o patine analogiche.
- **Accenti cromatici:** Toni crema, rosso, arancione.
- **Tone of voice:** Copy diretta, informale e ironica (stile pub/club).
- **Leggibilità TV (WCAG 2.2):** Testi grossi ad alto contrasto. Niente thin fonts, niente micro-label da interfaccia admin.

## 4. Jukebox TV
- **Purpose:** Musica, dediche, mood del locale, queue brani, tavoli attivi, atmosfera live.
- **Gerarchia visiva:**
  1. *Dominante:* Now Playing (Copertina grande, Titolo brano, Artista).
  2. *Secondario:* Chi ha messo il brano (Nome tavolo/Nickname) e relativa Dedica.
  3. *Periferico/Accessorio:* Queue (prossimi 2-3 brani in coda) senza rubare troppo spazio.
- **Blocchi:** Area centrale espansa per la copertina, sidebar minimale per la queue, overlay stile "sticker" per le dediche.
- **Copy:** "On air", "Spinto da Tavolo 4", "Prossima mina".
- **Bridge Kitchen:** Massimo 10–15% dello spazio visivo (es. un angolo in basso a destra).
  - *CTA Bridge:* "Hai fame? Ordina dalla Walrus Kitchen." oppure "Hai fame? Il banco ti aspetta."

## 5. Kitchen TV
- **Purpose:** Cibo, status ordini (preparazione/ritiro), promo/combo, avvisi del bancone/cucina.
- **Gerarchia visiva:**
  1. *Dominante:* Ordini "Pronti al ritiro" (Numeri enormi o nomi chiari ad alto contrasto).
  2. *Secondario:* Ordini "In preparazione" (lista più piccola per rassicurare il cliente).
  3. *Periferico/Accessorio:* Promo food attive (es. combo burger + birra).
- **Blocchi:** Tabellone diviso a colonne stile "Scoreboard" aeroportuale o vintage diner, banner inferiore/laterale per i messaggi dello staff.
- **Copy:** "Pronti al fuoco!", "In cottura...", "Ritira o lo mangiamo noi".
- **Bridge Jukebox:** Massimo 10–15% dello spazio visivo.
  - *CTA Bridge:* "Scegli una canzone mentre aspetti" oppure "Metti un pezzo, il cuoco è stanco."

## 6. Cosa deve restare separato
- **Layout primario:** Jukebox TV ruota attorno a un'immagine centrale (cover album). Kitchen TV ruota attorno a dati numerici/testuali incolonnati.
- **Codice/Componente:** Non usare lo stesso file root (`LiveTvScreen.jsx`) riempito di condizioni `if`. Devono essere schermate a sé stanti (route dedicate).
- **Focus:** L'attenzione dello spettatore non deve mai competere tra musica e ordini.

## 7. Cosa può essere condiviso visivamente
- **Tipografia:** Stessa scala tipografica e font (con pesi bilanciati per le distanze).
- **Palette & Texture:** Stessi background dark/grunge, stessi colori d'allarme/evidenza.
- **Asset decorativi:** Design system degli "sticker", loghi Walbox, stili delle card o ombre.
- **Transizioni:** Nessun ticker nervoso o animazione caotica in entrambe; usare transizioni di comparsa morbide ma nette.

## 8. Concept consigliato per Jukebox TV
**"Pub Poster Live"**  
Evolve l'approccio dell'attuale `LiveTvScreenWalrusPoster.jsx`. La schermata ricorda una locandina da concerto affissa al muro di un pub. La copertina del brano è enorme e centrale. Le dediche si stampano sopra l'immagine come grossi timbri o adesivi. Il bridge Kitchen appare come un "flyer" colorato attaccato nell'angolo in basso.

## 9. Concept consigliato per Kitchen TV
**"Retro Neon Scoreboard"**  
Un tabellone stile diner ma con animo dark. Colonne molto nette. Numeri d'ordine giganti giallo/crema su sfondo scurissimo per massima leggibilità. Una leggera pulsazione visiva (senza accecare) quando un numero passa nello stato "Pronto". Il bridge Jukebox è una "fascia" inferiore o un box laterale con la miniatura del brano attuale e la CTA per la musica.

## 10. Implementation map futura
1. Approvazione di questo documento da parte del Founder/CEO.
2. Sviluppo variante statica isolata per Kitchen TV (`src/pages/KitchenTvScreenScoreboard.jsx`) con dati hardcoded.
3. Polish dell'attuale `LiveTvScreenWalrusPoster.jsx` per introdurre il Bridge Kitchen statico.
4. Test leggibilità su TV reale (simulazione).
5. Integrazione dati dinamici (integrazione dati dinamici solo dopo approvazione tecnica, usando la fonte ordini già validata nel progetto).
6. Aggiunta route definitiva nell'app (toccabile solo in una fase dedicata successiva, con approvazione esplicita della route).

## 11. Do-not-touch
Regole ferree per la fase implementativa (NIENTE MODIFICHE A):
- `src/App.jsx` (toccabile solo in una fase dedicata successiva, con approvazione esplicita della route).
- Sistema di routing attuale (toccabile solo in una fase dedicata successiva, con approvazione esplicita della route).
- Dati o logiche di Supabase.
- Logiche Spotify Auth o core services API.
- Configurazione `package.json`, `.env`, ecc.
- Nessun refactor di base dati o stato globale.

## 12. Stop conditions
Fermarsi e richiedere intervento decisionale se:
- La costruzione del "Bridge" (es. mostrare Now Playing sulla Kitchen TV) richiede di smontare il global state dell'app.
- Lo spazio visivo dedicato ai bridge supera la soglia tollerabile del 15% rompendo la gerarchia primaria della TV.
- Si tenta di unire Jukebox e Kitchen in un unico macro-componente "monolite".

## 13. Primo micro-task consigliato dopo approvazione
Creare in isolamento il file **`src/pages/KitchenTvScreenScoreboard.jsx`** con soli dati hardcoded fittizi (mockup UI ordini in preparazione e ordini pronti), per valutare e confermare l'estetica "Retro Neon Scoreboard" e la chiarezza dei pesi tipografici su schermo grande, senza toccare logiche di app esistenti.
