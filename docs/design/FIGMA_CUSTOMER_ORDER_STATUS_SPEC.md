# FIGMA SPEC — CustomerOrderStatus
Figma node: `5:452` — `CustomerOrderStatus_WalrusPoster_V1`
Target files: `src/pages/CustomerOrderStatus.jsx` / `.css`
Date: 2026-06-18

---

## 1. Frame purpose
Mobile order tracking screen (390px wide). Customer sees their kitchen order status after placing it. Has 4 status states: RICEVUTO → IN PREPARAZIONE → PRONTO → CONSEGNATO.

---

## 2. Colors
| Token | Value |
|---|---|
| `--bg-base` | `#1c1008` |
| `--bg-dark` | `#0f0a05` |
| `--bg-card` | `#261508` |
| `--orange` | `#f05a24` |
| `--yellow` | `#f8c534` |
| `--cream` | `#f5ead8` |
| `--cream-70` | `rgba(245,234,216,0.7)` |
| `--cream-35` | `rgba(245,234,216,0.35)` |
| `--cream-25` | `rgba(245,234,216,0.25)` |
| `--cream-12` | `rgba(245,234,216,0.12)` |
| `--card-border` | `rgba(245,234,216,0.1)` |
| `--divider` | `rgba(245,234,216,0.07)` |

---

## 3. Typography
| Use | Font | Size | Weight | Letter-spacing |
|---|---|---|---|---|
| Main headline | Anton | 38px | Regular | 0.38px |
| Sub-headline accent | Anton | 46px | Regular | 0.92px |
| Status banner label | Anton | 22px | Regular | 0.44px |
| Section labels | Anton | 10px | Regular | 2px |
| Timeline step active | Anton | 17px | Regular | 0.68px |
| Timeline step done/future | Anton | 13px | Regular | 0.52px |
| Data labels (TAVOLO etc.) | Montserrat Bold | 9px | 700 | 1.08px |
| Data values large | Anton | 28px | Regular | — |
| Data values medium | Anton | 22px | Regular | — |
| Data values small | Anton | 13–15px | Regular | — |
| Item names | Montserrat SemiBold | 13px | 600 | — |
| Body/description text | Montserrat Medium | 11–12px | 500 | — |
| Notes text | Montserrat Medium Italic | 13px | 500 | — |
| Notes label | Montserrat ExtraBold | 9px | 800 | 1.35px |

---

## 4. Layout structure (top → bottom, 390px wide)

1. **TopBar** (h: 84px, absolute overlay) — back icon left, "STATO ORDINE" center, bell icon right. `pt-48px` (status bar safe area).
2. **WalrusChefHero** (h: 366px) — centered Walrus Chef mascot image 190×190px with radial orange glow behind (260px circle, rgba(240,90,36,0.2) center). Below: headline "IL TUO ORDINE / È IN CUCINA." (Anton 38px cream) + "PREGATE." (Anton 46px orange).
3. **OrderInfoGrid** (h: 162px) — dark card (`#261508`, border `rgba(245,234,216,0.1)`), 350px wide, 2×2 grid:
   - Top-left: TAVOLO → value in yellow 28px
   - Bottom-left: ORA ORDINE → clock icon + time in cream 22px
   - Top-right: NICKNAME → value in orange 13px
   - Bottom-right: ORDINE N. → value in cream-60 15px
   - "DATI ORDINE" header row, dividers between cells.
4. **CurrentStatusBanner** (h: 92px) — full-width orange card (`#f05a24`), glow `drop-shadow(0 4px 16px rgba(240,90,36,0.33))`. Pulse dot left. Anton 22px white "IN PREPARAZIONE". Subtitle Montserrat SemiBold 12px white 75% opacity.
5. **StatusTimeline** (h: 311px) — "PROGRESSIONE" label (Anton 10px cream-30). 4 steps:
   - RICEVUTO: small dot (28px, orange fill+border), orange connector line, label 13px cream-70
   - IN PREPARAZIONE (active): large dot (36px, orange+glow, inner dark dot), Anton 17px orange label, cream-85 subtitle
   - PRONTO (future): dimmed dot (28px, cream-20 border, cream-15 inner), cream-25 label
   - CONSEGNATO (future): same dimmed style, cream-25 label
   - Connector lines: 1px, orange for done steps, cream-12 for future
6. **OrderedItemsPanel** (h: 241px) — dark card 350px, header "HAI ORDINATO" / "QTÀ / PREZZO". Each row: qty badge (24×24px, yellow-12 bg, yellow-20 border, Anton 11px yellow) + item name (Montserrat SemiBold 13px cream) + price (Anton 13px cream-60). Dividers between rows. Total row: yellow-6 bg, "TOTALE" cream-40 + total value yellow 22px.
7. **KitchenNotesPanel** (h: 76px) — dashed border card (cream-15), 📝 emoji + "NOTE PER LA CUCINA" label + italic note text cream-65.
8. **JukeboxBridgeCard** (h: 157px) — gradient card (deep purple-to-dark-red `#1a0a3a → #2a0d0d`), orange border. Text: "MENTRE ASPETTI / METTI UN PEZZO / AL JUKEBOX" + description. Orange circle button (52px) with music icon on right.
9. **MyOrdersSwitcher** (h: 151px) — horizontal scroll of order cards (90×92px each). Active card: yellow-12 bg, yellow border. Inactive: cream-5 bg, cream-10 border. Each card: table label (yellow or cream-50), order number, status badge.
10. **ReadyAlertBottomBox** (sticky/absolute at y:925) — gradient bar, bell icon + "QUANDO È PRONTO / TI AVVISIAMO NOI" (cream + yellow).
11. **DemoStateControls** (DEV only, h: 73px) — row of 4 state buttons: RICEVUTO / IN PREPARAZIONE (active orange) / PRONTO / CONSEGNATO.

---

## 5. Spacing
- Page horizontal padding: `20px`
- Cards: 350px wide (390 - 40px padding)
- Card inner padding: `16px`
- Section gaps: `16–24px` top padding between sections
- Bottom padding of scroll: `100px`

---

## 6. Assets needed
| Asset | Description |
|---|---|
| Walrus Chef mascot | `imgImageWalrusChefMascotteDiWalrusKitchen` — chef walrus illustration with hat |
| Bell icon | `imgIcon` — notification bell |
| Clock icon | `imgIcon1` — small clock for order time |
| Check icon | `imgIcon2` — checkmark for completed step |
| Music/Jukebox icon | `imgIcon3` — music note for jukebox CTA button |
| Back chevron icon | `imgIcon4` — left arrow for TopBar back |
| Bell icon (TopBar) | `imgIcon5` — same bell for TopBar |

Assets available at Figma MCP URLs (7-day expiry). Must be downloaded or replaced with local equivalents.

---

## 7. Status states (4 variants)
The design shows "IN PREPARAZIONE" as active. The component must support 4 states:
- `received` — step 1 active
- `preparing` — step 2 active (shown in Figma)
- `ready` — step 3 active (banner turns green or different color TBD)
- `delivered` — step 4 active

Each state changes: StatusBanner label/color, active timeline dot, connector line colors.

---

## 8. Mapping to existing files
- `src/pages/CustomerOrderStatus.jsx` — main component (may not exist yet, needs creation or heavy update)
- `src/pages/CustomerOrderStatus.css` — styles (plain CSS, no Tailwind in this project)

---

## 9. Uncertainties / missing
- Does `CustomerOrderStatus.jsx` already exist? Must check before implementing.
- Local asset paths for Walrus Chef mascot and icons — Figma URLs are temporary.
- State management: does the parent pass `status` as prop or read from context/Supabase?
- "PRONTO" state banner color not shown in this Figma frame — to be confirmed.
- DemoStateControls: implement as DEV-only or always visible?
