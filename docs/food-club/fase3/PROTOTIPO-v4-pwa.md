# Prototipo v4 — installazione PWA e notifiche (gruppo 9)

File: `walrus-food-club-prototipo-v4.html` (copia di v3, v3 non toccato). Anteprime: `anteprime-pwa/` (`<id>-390.png`, `<id>-430.png`, `collage-390.png`).
Spec di riferimento: `PWA-NOTIFICHE-spec.md` §2, §3, §4.3, §5. Solo prototipo: nessun codice dell'app, nessuna rete.

## Preset nuovi (gruppo pannello «9 · Installa e notifiche (PWA)»)
iA1 iPhone Safari, tessera con card installazione · iA2 foglio guida Safari · iA3 prima apertura dalla Home (bentornato) · iA4 tessera ritrovata + card notifiche con buono («NON PERDERTI I TUOI 5 €») · iA5 finestra permesso iOS · iChrome guida Chrome iOS · iInapp in-app Instagram · iOld iOS < 16.4 · aB1 Android INSTALLA WALBOX · aB2 finestra del browser · aB3 Android installata → notifiche · aNo Android senza evento (menu ⋮) · nOn notifiche attive · nDen permesso negato (card una volta) · nInst già installata aperta dal browser · nPrefs preferenze 3 categorie · nPrefsDen preferenze con permesso negato · nJoin benvenuto con card installazione · nStatus stato ordine pagato con riga «Avvisami quando sblocco il premio» · nCopy0 variante «IL TUO PREMIO TI ASPETTA» (D-20).

## Scene e preset v3 modificati
- Nuove scene: `bentornato`, `acc1`/`acc2` (accesso col numero, non «Iscriviti»; poi «Tessera ritrovata ✓»).
- `join3`: invito sotto la CTA (installazione, oppure notifiche su Android). `tessera`: invito in fondo al blocco progresso. `clubCard` (stato ordine pagato con timbro/buono): riga avviso. Nessun invito in menu/sacco/sumup/join1/join2.
- `prefs` riscritta: stato del telefono, Ordini / Tessera e premi / Promo e novità, «Disattiva su questo telefono», «Esci da questo telefono»; toggle fermi se permesso negato.
- `home`: testo notifiche legato al permesso. `makeMember` non imposta più `push`.
- Preset v3 che cambiano aspetto (segnati ✎): prefs, p2c, p3, p4tess, tessHow, p4paid, p5paid, p6home, a2b, a4, cGuestJoin.
- Comandi `.proto-sim` (nascosti con `?clean=1`): «Simula: hai installato, apri dall'icona», «riapri dal browser», «Cambia piattaforma».
- Stato aggiunto in `base()`: platform, standalone, perm, notiTessera, installDismissed, guideOpen, pwaFresh (+ notiOrd, installDone, installedHint, pushDismissed, denyAck, sysDialog, _snap).

## Verifiche (Playwright, Chromium headless)
- 20 preset nuovi × (390×844, 430×932), scale 2: 40 screenshot + collage. Errori console: 0. Overflow orizzontale: 0. Testi obbligatori mancanti: 0. Bottoni nuovi sotto 44 px: 0.
- Click reali, entrambe le larghezze, tutti PASS: iA1→guida→chiudi; simula Home→bentornato→OTP→tessera ritrovata→ATTIVA→Consenti→riga attiva; aB1→INSTALLA→Installa→card notifiche→Non consentire→card negato→«Ho capito»; toggle in nPrefs; toggle disabilitati in nPrefsDen; nStatus→guida.
- Regressione v3 (p1, p3, p5paid, prefs, staffFine, p2c, cGuestJoin, p4paid, a4): render senza errori console.
- Letti a vista circa 10 screenshot; corretti: testo maiuscolo nei bottoni delle finestre di sistema, `<b>` che rompeva un passo della guida in-app, area vuota negli screenshot con overlay (ora solo viewport).

## Limiti noti
- Finestre di sistema/browser, installazione e permesso sono solo simulati (grafica neutra con etichetta); i passi reali delle guide (voci di menu, posizione dei tasti) non sono verificati su dispositivo reale.
- Non provati: Android in-app, desktop, flusso «Esci da questo telefono» e «Disattiva» solo a vista/logica semplice.
- Con `?clean=1` i comandi di simulazione sono nascosti: il percorso Home→bentornato si prova dal pannello o senza `clean`.
- In v4 i preset v3 mostrano ora la card installazione dove la spec la prevede (piattaforma di default iPhone Safari).
