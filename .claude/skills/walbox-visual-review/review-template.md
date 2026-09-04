# VISUAL AUDIT <versione> — <schermata> — <data>

Reviewer: visual-reviewer · Skill: walbox-visual-review **V1.1** · Modalità: **READ-ONLY**

| Campo | Valore |
|---|---|
| Commit revisionato | `<SHA>` — `<subject>` |
| Worktree isolato | `<sì/no>` — `<path>` (obbligatorio se tree sporco, §2.1) |
| Modifiche non committate | **fuori scope** di questa review |
| URL testato | `<url>` |
| Figma MCP | `<disponibile / non disponibile>` — file `8f8ZqE0Q2ysRr9saQkEP7d`, node letti: `<elenco>` |
| ENV_BLOCKER attivi | `<n>` — vedi §9 |

**Nessun file di prodotto modificato.**

---

## 1. VISUAL VERDICT

**<SHIP-READY | NEEDS FIX PASS | NOT READY>** · Coverage: **<COMPLETA | PARZIALE>**

<Una o due righe: perché questo verdetto.>

Conteggio: **P0 `<n>` · P1 `<n>` · P2 `<n>`** · ENV_BLOCKER `<n>` *(fuori conteggio severità)*

---

## 2. Coverage matrix (§4.1)

| Surface | 390 | 430 | Desktop | Nota se `—` |
|---|:--:|:--:|:--:|---|
| Home | | | | |
| Menu Categorie | | | | |
| Panini | | | | |
| Pesi Massimi | | | | |
| Cicchetti | | | | |
| Insalatone | | | | |
| Tartare | | | | |
| Cart (≥1 prodotto) | | | | |

`✓` visitata con screenshot · `—` non visitata (motivo obbligatorio)

---

## 3. Issue table

| ID | Sev | Tipo | Tag | Schermata | Viewport | Problema | Fix proposto |
|----|-----|------|-----|-----------|----------|----------|--------------|
| V1 | P0 | A CODE_ONLY | OBSERVED | | 390 | | |
| V2 | P1 | B ASSET | INFERRED | | 390/430 | | |

Sev: P0 · P1 · P2 (`ENV_BLOCKER` va in §9, non qui)
Tipo: A CODE_ONLY · B ASSET · C FIGMA_MISMATCH *(solo con node letto)* · D DESIGN_DECISION *(solo se §5 non copre)*
Tag: **OBSERVED** · **INFERRED** (`NOT_VERIFIED` va in §9, non qui)

---

## 4. Evidence

### V1 — <titolo> · `<OBSERVED|INFERRED>`
- Screenshot: `<path>`
- Codice: `src/....jsx:NN` / `src/....css:NN`
- Verifica runtime: `<output elementFromPoint / getComputedStyle / history.state / console>`
- Figma: `8f8ZqE0Q2ysRr9saQkEP7d / <node>` — oppure `n/a`
- Superficie del claim colore (§3.4): `<CSS renderizzato | token sorgente | pixel asset | n/a>`
- Atteso: `<...>` · Osservato: `<...>`

---

## 5. Checklist

| # | Voce | Esito | Finding | Nota |
|---|------|-------|---------|------|
| 1 | Viewport 390 | | | |
| 2 | Viewport 430 | | | |
| 3 | Desktop | | | |
| 4 | Responsive / no scroll orizzontale | | | |
| 5 | Overflow / sticky overlap | | | |
| 6 | Spacing / radius / alignment | | | |
| 7 | Figma ↔ frontend (node canonico) | | | |
| 8 | Typography | | | |
| 9 | Palette | | | |
| 10 | Icone active/inactive (§5.1) | | | |
| 11 | No blu fuori design system (§3.4) | | | |
| 12 | Crop e background immagini | | | |
| 13 | Coerenza fotografica (§5.2) | | | |
| 14 | Watermark / testo baked-in | | | |
| 15 | Real click + elementFromPoint | | | |
| 16 | Back / navigation (history.state + back reale) | | | |
| 17 | Console / broken images | | | |
| 18 | Visual consistency cross-category | | | |
| 19 | Cart con ≥1 prodotto | | | |
| 20 | Coverage matrix completa | | | |

---

## 6. Rivalutazione della review precedente (§8)

| ID V(n) | Titolo sintetico | Esito | Perché |
|---|---|---|---|
| V0 | | REJECTED_FALSE_POSITIVE | regola violata: §3.x |
| V1 | | CONFIRMED | |
| V2 | | PARTIALLY_CONFIRMED | portata corretta: `<...>` |

**Sintesi:** CONFIRMED `<n>` · PARTIALLY_CONFIRMED `<n>` · REJECTED_FALSE_POSITIVE `<n>` · NOT_VERIFIED `<n>` · NEW `<n>`

---

## 7. Quick wins

Issue tipo A, rischio basso, un solo pass:

1. `<ID>` — `<file>` — `<fix in una riga>`

---

## 8. Asset gaps

| Asset mancante / da rilavorare | Path suggerito | Perché (vs §5.2) | Chi |
|---|---|---|---|
| | | | Eros / Antigravity |

---

## 9. ENV_BLOCKER · Rischi residui · NOT_VERIFIED

### ENV_BLOCKER

| ID | Descrizione | Cosa rende NOT_VERIFIED | Chi risolve |
|---|---|---|---|
| E1 | | | Eros |

### NOT_VERIFIED

- `<cosa non è stato possibile verificare e perché>`

---

## 10. Recommended fix pass

**Scope proposto:** `<obiettivo unico>`
**File da toccare:** `<elenco chiuso>`
**Ordine:** `<1. ... 2. ...>`
**NON toccare:** routing, Supabase, mockData, package.json, asset non elencati.
**Aree protette coinvolte (CLAUDE.md §5):** `<sì/no + quali>`
**Esecutore:** **diverso dal reviewer** (§0)
**Approvazione Eros necessaria:** sì
