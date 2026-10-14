# 13 — EXPERIENCE OS CONSOLIDATION R007-R012
> Pack di consolidamento per aggiornare i master file Walbox Ho.Re.Ca. Product OS  
> Data: 2026-06-22  
> Ambito: R007 Venue Gamification, R008 Dashboard Value, R009 Venue TV, R010 Mission Night, R011 Customer Identity, R012 Retention Loops

---

## Scopo del pack

Questo pack consolida le ricerche R007-R012 nei master file del workspace `WALBOX_HORECA_PRODUCT_OS`.

Non contiene codice.  
Non contiene implementazione.  
Serve per sostituire i master file del progetto con versioni aggiornate e coerenti.

---

## Decisione consolidata

Walbox deve evolvere da QR/order/kitchen a:

```text
Walbox Venue Experience OS = customer experience + ordini + kitchen + pagamenti + loyalty + live screen + mission/event + dashboard valore + retention light
```

Formula prodotto:

```text
QR → nickname/sessione → tavolo/team → interazione → ordine → pagamento paid → punti/reward → TV live moment → dashboard valore → ritorno
```

---

## Ricerche consolidate

| Ricerca | Ambito | Decisione principale |
|---|---|---|
| R007 | Venue Gamification / Live Screen / Social Wall | Live Pulse Engine, non social wall aperto |
| R008 | Dashboard Value / Analytics | Dashboard value-first, non BI/POS fiscale |
| R009 | Venue TV / Digital Signage UX | Live Venue Channel con default loop + live interruptions |
| R010 | Event & Quiz Engine / Mission Night | Mission Night Light prima di Quiz Night completo |
| R011 | Customer Identity / CRM Light | Progressive Identity Ladder, no account obbligatorio |
| R012 | Retention & Community Loops | Return Loop Engine, non CRM marketing pesante |

---

## Fasi prodotto aggiornate

| Fase | Nome | Scope |
|---|---|---|
| V1 competitivo | Order/Kitchen reale | menu, ordini, KDS, banco, report base |
| V1.5 serio | Payment + Loyalty + Live Pulse | pagamento app, punti, promo, TV, tavolo on fire, save progress |
| V2 operativo | Venue OS | Mission Night, Quiz Night, wallet, social wall moderato, event report |
| V3 gestionale/CRM light | Retention + Integration | CRM opt-in, reactivation, POS/cassa partner, campaign attribution |

---

## File inclusi nel pack

| File | Tipo aggiornamento |
|---|---|
| `00_MASTER_CONTEXT.md` | stato strategico generale post-R012 |
| `03_FEATURE_MATRIX_MASTER.md` | nuove matrici Experience/TV/Mission/Identity/Retention |
| `05_FIELD_RESEARCH_MASTER.md` | nuove domande campo e segnali vendita |
| `06_WALBOX_STRATEGY_MASTER.md` | roadmap e posizionamento aggiornati |
| `07_DECISION_LOG.md` | decisioni R007-R012 + decisione consolidamento |
| `08_COMPETITIVE_STRATEGY_MASTER.md` | strategia competitiva Experience OS |
| `09_VENUE_EXPERIENCE_OS_MASTER.md` | cuore Experience OS consolidato |
| `11_DASHBOARD_VALUE_OS_MASTER.md` | dashboard KPI value-first post-R012 |

---

## Regole non negoziabili consolidate

1. Il QR code non è il prodotto: è l'ingresso nel mondo digitale del locale.
2. Punti, reward e revenue KPI solo dopo `payment_status === paid`.
3. Nessun account obbligatorio per ordinare.
4. Nickname pubblico su TV solo con consenso.
5. TV sempre con safe mode.
6. Social wall aperto solo V2 e solo moderato.
7. Mission Night Light prima di Quiz Night completo.
8. Marketing email/SMS/WhatsApp solo V3 opt-in.
9. Dashboard value-first, non vanity metrics.
10. Walbox resta cassa-agnostic in V1/V1.5.

---

## Fonti ufficiali principali da archiviare per R007-R012

### R007 / R010 — Gamification, quiz, eventi

- Crowdpurr — https://www.crowdpurr.com/
- Kahoot Events — https://kahoot.com/
- Mentimeter — https://www.mentimeter.com/
- Wooclap — https://www.wooclap.com/
- SpeedQuizzing — https://www.speedquizzing.com/
- QuizXpress — https://www.quizxpress.com/
- TriviaHub Live — https://triviahublive.io/bar-trivia-night/
- BoardQ — https://www.boardq.io/quiz
- Buzztime — https://buzztime.com/
- EventMobi Gamification — https://help.eventmobi.com/en/knowledge/what-is-gamification
- Goosechase — https://goosechase.com/
- Scavify — https://www.scavify.com/event-gamification
- SocialPoint — https://www.socialpoint.io/event-gamification/

### R007 / R009 — Social wall, TV, signage, jukebox

- Walls.io — https://walls.io/
- Taggbox Display — https://taggbox.com/display/
- Curator.io — https://curator.io/
- Juicer — https://www.juicer.io/
- Rockbot Request — https://rockbot.com/request
- TouchTunes — https://www.touchtunes.com/
- Jukestar — https://jukestar.mobi/
- Spotify public/commercial use — https://support.spotify.com/us/article/spotify-public-commercial-use/
- Samsung VXT / Restaurant menu board tips — https://vxt.samsung.com/blog/restaurant/restaurants-digital-menu-board-design-tips
- Yodeck — https://www.yodeck.com/
- ScreenCloud Digital Menu Board — https://screencloud.com/digital-menu-board
- ScreenCloud Pubs — https://screencloud.com/hospitality/digital-signage-for-pubs
- OptiSigns Restaurants — https://www.optisigns.com/industries/restaurant
- Atmosphere TV — https://www.atmosphere.tv/
- LG Commercial Display — https://www.lg.com/global/business/commercial-display/digital-signage/
- WCAG contrast minimum — https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum

### R008 / R011 / R012 — Dashboard, identity, retention, CRM light

- Qromo Order & Pay — https://qromo.it/ordini-pagamenti/
- Cassa in Cloud Report — https://www.teamsystem.com/horeca/cassa-in-cloud/funzionalita/report-statistiche/
- Toast Reporting — https://pos.toasttab.com/products/reporting
- Square Restaurants — https://squareup.com/us/en/restaurants
- Lightspeed Dashboard — https://k-series-support.lightspeedhq.com/hc/en-us/articles/4403208456603-Understanding-the-Dashboard-page
- Thanx — https://www.thanx.com/
- Paytronix Loyalty — https://www.paytronix.com/loyalty/
- SevenRooms CRM — https://sevenrooms.com/platform/crm/
- OpenTable CRM — https://www.opentable.com/restaurant-solutions/products/relationship-management/
- Square Loyalty — https://squareup.com/us/en/software/loyalty
- Toast Loyalty — https://support.toasttab.com/en/article/Getting-Started-Toast-Loyalty
- BonusQR — https://bonusqr.com/
- Stamp Me — https://www.stampme.com/
- PassKit — https://passkit.com/
- Apple Wallet Loyalty Passes — https://developer.apple.com/wallet/loyalty-passes/
- Google Wallet Loyalty Cards — https://developers.google.com/wallet/retail/loyalty-cards
- Loopy Loyalty — https://loopyloyalty.com/
- Open Loyalty — https://www.openloyalty.io/
- GDPR Article 5 — https://gdpr-info.eu/art-5-gdpr/
- EDPB Consent Guidelines — https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_202005_consent_en.pdf
- Garante Privacy Fidelity Card — https://www.garanteprivacy.it/home/docweb/-/docweb-display/docweb/1103020

---

## Prossimo step consigliato

Dopo sostituzione dei master file, passare a una delle tre attività operative di prodotto:

1. **Live Pulse Core Scope V1.5** — definire esattamente feature e limiti.
2. **Walrus Live Channel UX Brief** — progettare TV reale, safe e vendibile.
3. **Field Research Script** — preparare interviste per 3 locali su TV, loyalty, missioni e retention.

---

## Addendum 2026-06-28 — Post Checkpoint Kitchen V1.1

### Stato consolidato aggiornato

Dopo il checkpoint `WALBOX_KITCHEN_CHECKPOINT_FINALE_V1_1.md`, il progetto va letto così:

```text
Kitchen V1.1 = stabilizzata e pilot-ready controllato
Experience OS = strategia confermata
TV / Live Screen = centrale ma audit pending
Payment / Loyalty / Mission / Retention = roadmap, non immediato
```

### Decisione addendum

Il consolidamento R007-R012 resta valido, ma non deve far saltare la priorità operativa.

La sequenza aggiornata diventa:

```text
1. Chiudere repo/state V1.1
2. Smoke produzione Kitchen
3. TV Route & Data Audit
4. Decisione pilot: Kitchen-only / Kitchen + Safe TV / Kitchen + Safe Live TV
5. Pilot controllato
6. Solo dopo: V1.5 Payment + Loyalty + Live Pulse + Dashboard Value
```

### Interpretazione corretta della TV

La TV non è un extra. È uno dei differenziatori principali di Walbox. Però al 2026-06-28 non va trattata come già validata dalla V1.1.

Nuovo stato:

| Modulo | Stato |
|---|---|
| Default Loop | target TV / da verificare se esiste già |
| Live Interruptions | target V1.5 |
| QR persistente TV | da verificare |
| Promo module TV | da verificare / V1.5 |
| Tavolo on fire | V1.5/V2 |
| Mood poll | V1.5 |
| Dediche/jukebox moderati | V1.5/V2 |
| Safe Mode | obbligatoria prima del pilot TV |

### Regola anti-dispersione

Le ricerche R007-R012 non autorizzano nuove feature immediate. Servono a non perdere la direzione mentre si valida la base V1.1.

