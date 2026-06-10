# Walbox Poster Asset Pack for Antigravity

Target folder inside the React/Vite project:

```txt
public/assets/tv-poster/generated/
```

## Files

| File | Use in `LiveTvScreenWalrusPoster.jsx` |
|---|---|
| `walbox-logo-full.png` | Main top-left complete logo lockup |
| `walrus-head-red.png` | Red-beanie walrus mascot / dedication icon / brand detail |
| `walrus-head-orange.png` | Large orange grunge walrus poster layer, center-right |
| `walrus-w-badge.png` | Circular W badge / stamp overlay |
| `walrus-pub-title.png` | Separate red “THE WALRUS PUB” title asset |
| `walbox-main-text.png` | Separate ivory “WALBOX” wordmark asset |
| `walbox-live-brush.png` | Separate red brush “LIVE” asset |
| `walbox-tagline.png` | Separate tagline “LIVE MUSIC. REAL PEOPLE. COLD BEER.” |

## Recommended first integration order

1. Use `walbox-logo-full.png` in the top-left header.
2. Add `walrus-head-orange.png` as center-right decorative layer.
3. Use separate assets only if the full lockup is too rigid for responsive layout.

## Important transparency check

Before integrating, Antigravity should verify if the PNGs have real alpha transparency. If a checkerboard or white background is visible in the rendered page, do not fix it with CSS. Create corrected PNGs with true alpha first.
