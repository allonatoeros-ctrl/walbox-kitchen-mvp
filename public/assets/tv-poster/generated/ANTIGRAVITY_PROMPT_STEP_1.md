# Prompt for Antigravity — Mount Walbox Poster Assets

Modifica solo `@src/pages/LiveTvScreenWalrusPoster.jsx`.

Asset folder:
`@public/assets/tv-poster/generated/`

Assets disponibili:
- `walbox-logo-full.png`
- `walrus-head-red.png`
- `walrus-head-orange.png`
- `walrus-w-badge.png`
- `walrus-pub-title.png`
- `walbox-main-text.png`
- `walbox-live-brush.png`
- `walbox-tagline.png`

Obiettivo primo step:
Sostituire l’header testuale/finto CSS con `walbox-logo-full.png`, posizionato in alto a sinistra, mantenendo layout TV 16:9 e stile poster grunge.

Regole:
- Non modificare `App.jsx`.
- Non toccare Supabase, Spotify, routing, ManagerDashboard o Customer pages.
- Non fare refactor.
- Usa `object-fit: contain`.
- Se l’asset mostra sfondo bianco/scacchiera, fermati e segnala che serve cleanup alpha reale.
- Non usare `mix-blend-mode` per fingere trasparenza.

Test:
1. `npm run build`
2. mostra file modificati
3. fermati
