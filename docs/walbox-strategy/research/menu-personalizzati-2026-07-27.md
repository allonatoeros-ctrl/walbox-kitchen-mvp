# Ricerca: menu digitali che spingono l'ordine — The Walrus / Walbox
*RESEARCH subagent — 27/07/2026 — solo lettura, nessuna modifica repo*

## Contesto
Il Walrus lancia i panini e la Kitchen (`src/pages/CustomerKitchenMenu.jsx`) è già live, con categorie COMBO ("COMBO LETALI") e una card upsell (`kitch-upsell-promo-card`). Le fondamenta ci sono: la domanda è come far salire lo scontrino medio senza sembrare un supermercato.

## Cosa fanno gli altri (ricerca web reale)
- **sunday** (QR order & pay, usato da pub/casual dining): serie di articoli "How QR Ordering Increases Average Check". Ricette chiave: foto grandi dei piatti (le foto di qualità alzano le vendite di un piatto fino al **+30%**, dato citato da Restaurant Dive), upsell contestuale al tap ("aggiungi patatine dolci a +2€?"), bundle scontati antipasto+main+dessert, spinta sulle bevande perché ad alto margine.
- **me&u** (QR ordering nei pub australiani/UK): prodotto dedicato "Crew & Staff Upsells" + upsell automatici nel menu; punta forte su Gen Z e su menu che cambiano per fascia oraria/evento.
- **storekit**: vende proprio "Auto upsells" come feature core del QR ordering — segno che nel settore è lo standard, non un extra.
- Pattern comune: il suggerimento arriva **al momento giusto** (quando scegli il panino, non dopo), ed è uno solo, non tre.

## 3-4 idee per il Walrus
1. **Combo Letale one-tap**: sul dettaglio panino, bottone "Fallo Letale: + birra media + patatine, −2€". Un tap, niente configuratori.
2. **Upsell contestuale**: scelto il panino → una sola proposta di birra abbinata ("con questo ci sta una rossa"). Alto margine, zero attrito.
3. **Menu per tavolo/momento**: happy hour, serata partita, tavolo grande → combo diverse (es. "Giro del tavolo: 4 panini + caraffa"). La Kitchen già gestisce categorie, si aggiunge il contesto.
4. **Foto vere dei panini** in card grande: costo quasi zero, effetto documentato (+30% sul piatto spinto).

## Rischi
- Upsell invadente = clienti scocciati e recensioni acide. Max 1 proposta per ordine.
- Sconti combo mal calcolati mangiano il margine: prima verificare food cost.
- Foto brutte peggio di niente.
- Complessità in cucina: le combo devono uscire come comande chiare, o si inceppa il pass.

## Fonti
- sundayapp.com — "5 Best Practices to Increase the Average Check with At-Table Ordering"; blog "More Items, More Spend: How QR Ordering Increases Average Check"
- meandu.com — prodotto Crew & Staff Upsells, blog menu/Gen Z
- storekit.com — feature "Auto upsells"
