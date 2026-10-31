# REEL_WALBOX — video promo per i clienti del pub

## ORA
- Obiettivo: reel verticale 1080×1920, ~20 s, muto, MP4, per Instagram del Walrus (thewalruspub_).
- Fase: v1 PRONTA e verificata (2026-10-30): h264 1080×1920, 30 fps, 20 s, muto; 6 fotogrammi controllati.
- Output: `ai-ops/reports/reel-walbox/` (gitignored): `walrus-reel.mp4` + `frames/` + `schermate/`.
- Codice di montaggio: scratchpad di sessione (`scratchpad/reel/`, temporaneo). Nessun file di prodotto toccato.
- Schermate reali dell'app (menu, pagamento, TV) con dati finti mockati; nessuna chiamata a produzione.
- Difetti noti v1: schermata pagamento mezza vuota; freccia finale tocca la "O" di TAVOLO; niente QR vero.
- Feedback Eros v1: spiega poco l'app; mostrare doppio tap e notifica; TOGLIERE la TV (nel locale non c'è).
- v2 proposta (~25 s): gancio CAMERIERE→TELEFONO · QR e menu · doppio tap sulla foto = zoom
  (`PosterCard.jsx`, 350 ms) · aggiungi e paga (online o in cassa) · notifica push reale
  "Il tuo ordine è pronto!" (`send-order-ready-push`, arriva solo se il cliente accetta le notifiche) · logo + QR.
- Audio possibile: effetti sintetizzati con ffmpeg (tap, whoosh, ding) + voce italiana macOS `say` (Rocko/Eddy/Alice).
  Musica: no generazione; file fornito da Eros o aggiunta su Instagram.
- v2 PRODOTTA (2026-10-30, subagent Opus high): `ai-ops/reports/reel-walbox/v2/walrus-reel-v2.mp4`, 25 s,
  1080×1920 30 fps + AAC, -14 LUFS. Voce Alice (`say -r 172`), effetti sintetizzati, niente TV. Dettagli in `v2/note.md`.
- Difetti v2 visti a campione: logo finale nel box nero mezzo vuoto; "TOTALE 13,90 €" tagliato in alto nel riquadro pagamento.
  Schermate Pesi Massimi catturate con modifiche non committate di un'altra sessione.
- Prossimo passo: Eros ascolta la v2 (voce Alice, pronuncia "Uòlrus") e dà feedback; poi ritocchi v3.
- Decisioni aperte: testi delle scene (proposta Claude, Eros può cambiarli); musica la aggiunge Eros su Instagram.

## Stile (dalle copertine di thewalruspub_, reel non visibili senza login)
Scritte enormi condensed bold, fondo verde fluo o nero, giallo/nero del logo, sottotitoli gialli parlati,
zoom secchi sui panini, ironia da pub.

## Storyboard
| s | Scena |
|---|---|
| 0–3 | Verde fluo, "CAMERIERE?" barrato → "TELEFONO." |
| 3–7 | Telefono, QR sul tavolo, menu reale che scorre. Sub: "Scansioni. Scegli. Fine." |
| 7–11 | Foto nuove (panino, tartare, tagliere) con zoom secco, "MORDERE." |
| 11–15 | Schermata pagamento: "Paghi dal tavolo. Il bancone può aspettare." |
| 15–18 | TV cucina: "IN PREPARAZIONE" → "PRONTO" |
| 18–20 | Logo Walrus giallo: "Inquadra il QR sul tavolo." |

## Vincoli
Solo dev server locale (`.claude/launch.json` kitchen-dev, Supabase 127.0.0.1), dati finti, nessun ordine o
pagamento reale, nessuna chiamata a produzione, niente `rm`, nessuna modifica a `src/`, `api/`, `supabase/`.

Modello/effort: Sonnet medium (produzione), Opus medium (verifica).
