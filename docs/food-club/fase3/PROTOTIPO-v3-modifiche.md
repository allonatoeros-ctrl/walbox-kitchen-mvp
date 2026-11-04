# Prototipo Food Club v3 — modifiche

File: `walrus-food-club-prototipo-v3.html` (copia di fase 2, la fase 2 non è toccata). Menu ☰ PROTOTIPO in 8 gruppi (★ nuovo, ✎ modificato). `#<stato>` e `?clean=1` funzionanti. Sorgenti di lavoro in `src/` (non necessari). Repo Walbox non toccato.

## Stati NUOVI (id)
- `m0`, `m1`: menu da iscritta con striscia progresso ("0/2 visite", "1/2 visite · scade il 6/12").
- `tessHow`: tessera con "Come funziona" aperto.
- `vUsato` (UTILIZZATO), `vRilasc` (RILASCIATO, ordine annullato).
- Amico: `a1` link d'invito, `a2` iscrizione col telefono (banner regalo), `a2b` iscritto col timbro di benvenuto visibile, `a3` sacco ("completa la tessera"), `a4` tessera completa e buono sbloccato per la volta dopo, `a5` lato invitante "il tuo amico ha ordinato: +5 €".
- `camp2`: campagna 2 (test), tessera a barra € (32 su 50 €), premi già ottenuti validi.
- Staff tablet: `staffComanda` (BUONO −5 €, DA INCASSARE grande, Pagato/Annulla funzionanti), `staffFine` (fine servizio, 4 ordini al banco, 2 con buono, Pagato / Annulla non pagato con rilascio buono, contatori che si aggiornano).

## Stati MODIFICATI
- Tessera (`p3`, `p4tess`): "1 visita su 2" in grande, riquadro "Hai tempo fino al 6 dicembre per la 2ª visita" con barra giorni; nessun "Tessera di novembre" / "Campagna di novembre" (rimossi anche da `p2c`, `cGuestJoin`, home, messaggi, staff); regole in "Come funziona" richiudibile in fondo.
- Menu (`p1`, `p6menu`): striscia non iscritti chiudibile conservata; iscritti: progresso/buono per primi ("Buono 5 € pronto · scade il 13/12 · tessera 0/2").
- Carrello (`p4cart`, `p5cart`, `p7low`, `p7on`, `cExpMenu`): suggerimento per i 12 € conservato; righe Club dentro `.cx`; nel footer di pagamento chip "BUONO −5 €" e "TIMBRO IN ARRIVO", totale scontato.
- Buono: chip DISPONIBILE / RISERVATO · #W31 ("Buono applicato all'ordine #W31 — si conferma quando paghi") / UTILIZZATO / RILASCIATO / SCADUTO (`p6`, `cReserved`, `cCancel`, `cExpired`, `p8pcp`, `p8online`, `p5paid`).
- Amico (`p9`): due vantaggi in evidenza (5 € a te, timbro di benvenuto a lui) e regole nuove (solo nuovi iscritti, telefono verificato, niente auto-inviti, max 5 premi/30 gg).
- Testi regole aggiornati ovunque: timbro solo per ordini del cliente (staff escluso), buono su ordine successivo da 12 € di food, uno per ordine, non cumulabile. Staff `staffCamp`: Campagna 1 e Campagna 2.

## Anteprime (`anteprime/`)
`<stato>-390.png` e `-430.png` per: p1 m0 m1 p6menu p4cart p5cart p7low p7on a3 cExpMenu (viewport) e p2 p2c p3 p4tess tessHow p4pcp p4paid p5paid p6 p6home p8online p8pcp cReserved vUsato vRilasc cExpired cCancel cGuestJoin p9 a1 a2 a2b a4 a5 camp2 (pagina intera). Staff `staffFine-1280.png`, `staffComanda-1280.png`, `staffCamp-1280.png` (1280×800). Collage: `collage-390.png`, `collage-430.png`.

## Verifiche
- Pulsanti PAGO ORA / PAGO AL BANCO visibili senza scroll: 390×844 (fondo 836) e 430×932 (fondo 924), tutti i sacchi.
- Nessun overflow orizzontale, nessun errore in console su tutti gli stati; flusso amico, staff e pannello provati con click reali.

## Problemi residui / da decidere
- La data 6 dicembre deriva dalla prima visita simulata (6/11), non dal 4/12 dell'esempio.
- Campagna 2: durata, soglia minima per ordine e uso del buono (12 €?) non definiti; il prototipo non li afferma.
- Timbro di benvenuto: nessuna finestra di 30 giorni per l'invitato (non specificata).
- Dati staff di esempio; sul tablet la comanda e il fine servizio sono nuove viste, da collocare nella UI Solo reale.
- Il telefono "nuovo/già iscritto" e i limiti anti-abuso sono solo testo, non simulati.
