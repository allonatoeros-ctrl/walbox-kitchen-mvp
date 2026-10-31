# Brief: audit visivo v2 del menu cliente (chat fresca, modello più potente)

Creato 2026-10-24. Da usare in una chat nuova: "esegui ai-ops/current/AUDIT_V2_BRIEF.md".
Stato generale del restyling: `ai-ops/current/RESTYLING_MENU.md`.

## Compito
Rifare da zero l'AUDIT VISIVO (Fase 2) del MENU CLIENTE di Walbox Kitchen, più in profondità del primo (v1).
Sola lettura: non modificare file di prodotto, non fare commit, non toccare `.claude/*`, non leggere `.env*`.
Delega la parte con browser al subagent `visual-reviewer` passando il modello più potente disponibile, oppure
fai tu la review con le skill `walbox-visual-review` e `impeccable` (modalità audit/critique).
Report completo in `ai-ops/reports/restyling-fase2-audit-v2.md`, screenshot in
`ai-ops/reports/visual/restyling-fase2-v2/` (cartelle gitignored). In chat: max 8 righe.

## Contesto
- Repo: questa cartella, branch `feat/restyling-menu`, segnalibro `menu-foto-nuove-v1` (foto nuove già dentro).
- Eros vuole rinfrescare il look del menu cliente (QR) tenendo questa base. L'audit serve a scegliere la direzione
  grafica (la sceglie Eros, non tu) e a elencare cosa rendere più veloce.
- Tono Walrus: bold, pub, poster, ironico ma leggibile, non SaaS generico (CLAUDE.md §8). Mobile-first 390/430.
- Anteprima: `preview_start` con name `kitchen-dev` (http://localhost:5174/kitchen, Supabase finto: menu e foto
  dal codice; ordini e pagamenti NON funzionano). Non cliccare MAI invio ordine / PAGO ORA / PAGO AL BANCO.
- Regola foto Cicchetti (aggiornata 2026-10-24): piatti colorati AMMESSI; finding solo superficie fredda o
  crop/luce incoerenti.
- Già noti (riportarli solo come "noto"): CHIUDI che copre la cima del pane in Pulled Pork/Brisket, striscia Pesi
  Massimi con ritagli non ideali, taglieri aperti a 390 tagliati in basso (`ai-ops/reports/restyling-fase1c-recheck.md`).

## Cosa coprire
Home, ogni sezione (panini, pesi massimi, cicchetti, insalatone, taglieri, tartare, contorni, birre, bevande),
dettaglio di almeno 1 prodotto per famiglia, carrello/drawer (aggiungi un prodotto ordinabile), checkout fin dove
si apre senza inviare, `?evento=1` sulla home.
**Viewport: 390 e 430 per TUTTE le categorie, 1280 per home e carrello.** Il v1 non ha coperto 430/1280 di
Cicchetti, Insalatone, Tartare, Contorni, Birre, Bevande: recuperarli.
Per ogni schermata: gerarchia, tipografia, spaziature, coerenza di card/raggi/colori (token `--k-*`, `--kh-*`,
`--walrus-*` in `src/index.css`), leggibilità prezzo e bottone, target tocco >=44px, foto, cosa sa di "SaaS".

## Punto di partenza (v1, da verificare e approfondire, non da copiare)
Report v1: `ai-ops/reports/restyling-fase2-audit.md` (P0 0 · P1 5 · P2 11). P1 v1: prezzo debole (13px, contrasto
3,49:1); 4 anatomie di card (Contorni con componente vecchio); target tocco <44px (AGGIUNGI 38, CHIUDI 32, +/- 36);
allergeni gialli `#ffc107` con stile inline (`AllergenBadges.jsx`); carrello crema su app scura con footer che copre
nome/dove. Card home a coordinate assolute (`CustomerKitchenMenu.css` ~1497/1509). Due sistemi di token.
Velocità v1: 1 tap Crudo/Mortazza, 3 Pesi Massimi, 4 le altre; "Il menu" e hero ripetuto superflui.
Cerca ciò che il v1 ha perso: stati vuoti/errore, foto mancante, prodotto esaurito, carrello con molti articoli,
testi lunghi, safe-area iPhone, animazioni/transizioni, accessibilità (contrasti, focus, aria).

## Output richiesto
1. Tabella findings P0/P1/P2 con tag OBSERVED/INFERRED/NOT_VERIFIED, screenshot, file CSS/JSX probabile (solo se letto).
2. "Cosa sa di vecchio" (max 10 punti) e "Candidati velocità" (tap per ordine, passaggi superflui).
3. **Confronto con v1:** cosa conferma, cosa smentisce, cosa aggiunge.
4. **3 direzioni grafiche** (max 3, una raccomandata) con pro/contro e stima di lavoro (CSS soli o anche JSX).
   Eros sceglie.
5. Elenco di cosa NON hai potuto verificare.

## Dopo
Aggiorna `ai-ops/current/RESTYLING_MENU.md` (una riga in "Fase attuale" con verdetto e path report). Nessun commit.
Modello/effort: il più potente disponibile, effort alto.
