# Walrus Food Club V1 (loyalty food)

In una chat nuova: "riprendi da ai-ops/current/FOOD_CLUB.md sul branch docs/food-club-fase2", poi leggi solo `## ORA`.
Materiale completo: `docs/food-club/` (report, prototipo, SQL, anteprime).

## ORA (2026-11-03)
- **Dove:** branch `docs/food-club-fase2`, nato da `origin/main` = `595f639`. Solo documentazione: nessun codice dell'app
  toccato, nessuna migration, nessun deploy.
- **Fase 1 (analisi UX) fatta.** Le decisioni D1–D14 sono state discusse in chat. Quelle approvate sono sotto.
- **Fase 2 (prototipo) consegnata, in attesa di approvazione di Eros.**
  - Prototipo: `docs/food-club/walrus-food-club-prototipo.html`, un file autonomo. Bottone ☰ PROTOTIPO per i 38 stati;
    `#<stato>` per l'accesso diretto, `?clean=1` per gli screenshot.
  - Base visiva: il CSS del nuovo menu (branch `feat/restyling-hero`, PR #6), più classi `fc-*` costruite sui token
    `--poster-*`.
  - Report: `docs/food-club/REPORT-food-club-fase2.md`. Contiene percorso, casi, verifica grafica, problemi aperti ed
    elenco dei file da toccare.
- **Prossimo passo:**
  1. Eros lancia `docs/food-club/food-club-verifiche-select.sql` (solo SELECT, ruolo in sola lettura) e incolla gli output.
     Da questa sessione cloud il database non era raggiungibile.
  2. Eros approva il prototipo e decide A1–A9 (report §6). Le più urgenti: A2, A3, A4.
  3. Solo dopo: piano di implementazione a micro-task (skill `phase-plan`), con le aree protette indicate.
- **Non fare:** implementare nell'app prima dell'approvazione del prototipo (STOP chiesto da Eros).

## Decisioni approvate da Eros (Fase 2)
- Solo Walrus Melegnano. Solo food ordinato con Walbox.
- Il timbro si accredita a pagamento confermato, online o al banco.
- Il buono si riscatta solo nel sacco di Walbox.
- Primo mese: 2 ordini food ≥ 10 € in 2 serate diverse (taglio alle 06:00, Europe/Rome) entro 30 giorni → buono da 5 €,
  valido 30 giorni.
- Soglia per usare il buono: **12 € di food, provvisoria** (da confermare con la query Q1).
- Una campagna principale + "Porta un amico". Secondo mese: prova "Spendi 50 € → 5 €".
- Nessun SMS promozionale in V1 (SMS solo per il codice di accesso).
- Gli ordini creati dallo staff in cassa (`nickname = 'BANCO'`) sono esclusi. Gli ordini del cliente pagati al banco
  sono inclusi.
- Una sola route `/kitchen/club`.
- Campagne gestite dall'amministratore, senza editor in V1.
- Nessuna nuova identità grafica.
- Regola chiave: il buono si consuma solo a pagamento confermato. Se l'ordine non viene pagato o viene annullato, torna
  disponibile con la scadenza originale.

## Decisioni aperte (dettaglio nel report §6)
- **A1** soglia 12 € (dopo Q1).
- **A2** buono riservato su ordini al banco mai pagati: oggi gli ordini al banco non scadono da soli
  (`api/_lib/onlineAbandonSweep.js:32` chiude solo gli online). Proposta: rilascio alle 06:00.
- **A3** vantaggio per l'amico invitato e limite premi al mese.
- **A4** striscia nel menu per i non iscritti, sì o no.
- **A5** sconto sul totale o solo sul food.
- **A6** combo con bevanda conteggiato come food.
- **A7** revoca su rimborso.
- **A8** design della campagna "50 €".
- **A9** nome e testi.

## Da ricordare per l'implementazione
- Le righe Club nel sacco vanno **dentro `.cx`** (`CustomerCheckout.jsx`), altrimenti il footer sticky PAGO ORA / AL BANCO
  esce dallo schermo. Verificato nel prototipo.
- Il buono va applicato **in modo atomico alla creazione dell'ordine**: SumUp richiede un importo uguale a `total`.
- La categoria food oggi esiste solo nel client: serve una mappa nel server prima di contare timbri e soglie.
- I token `--poster-*` vivono solo in `.kitch-page`: vanno portati in uno scope condiviso per la card su `/kitchen/status`.
