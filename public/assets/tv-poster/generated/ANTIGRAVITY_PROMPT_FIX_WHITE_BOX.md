Modifica solo @src/pages/LiveTvScreenWalrusPoster.jsx.

Obiettivo:
riparare la schifezza del rettangolo bianco usando SOLO gli asset clean-alpha.

Usa questi asset:
@public/assets/tv-poster/generated/walbox-logo-full.png
@public/assets/tv-poster/generated/walrus-head-orange.png
@public/assets/tv-poster/generated/walrus-head-red.png
@public/assets/tv-poster/generated/walrus-w-badge.png
@public/assets/tv-poster/generated/walrus-pub-title.png
@public/assets/tv-poster/generated/walbox-main-text.png
@public/assets/tv-poster/generated/walbox-live-brush.png
@public/assets/tv-poster/generated/walbox-tagline.png

REGOLE:
- Non usare più gli asset vecchi se mostrano bianco/scacchiera.
- Non usare background bianco.
- Non usare mix-blend-mode per fingere trasparenza.
- Ogni <img> deve avere background: transparent.
- Usa object-fit: contain.
- Non deformare gli asset.
- Non toccare App.jsx, Supabase, Spotify, routing, ManagerDashboard o Customer pages.
- Non fare refactor.

Prima modifica:
1. sostituisci il logo alto sinistra con walbox-logo-full.png;
2. ridimensiona il logo per stare simile alla reference;
3. verifica nel browser su sfondo scuro che non compaia nessun rettangolo bianco.

Poi fermati.