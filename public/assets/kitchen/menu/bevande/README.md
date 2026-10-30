# ASSET BEVANDE — SPEC DI PRODUZIONE

MENU POLISH SPRINT, 2026-09-16. **Batch fotografico consegnato e cablato.** Gli 8 file (batch del 2026-10-30) sono in
questa cartella (512×512 `.webp`) e `image` in `src/data/kitchenMockData.js` punta al path
definitivo di ciascuno. Il campo ponte `imagePending` è stato rimosso: non serve più.

La card cliente (`src/components/kitchen/BevandeSection.jsx`) mantiene comunque il ramo
placeholder "FOTO IN ARRIVO" come fallback per una voce bevanda futura aggiunta prima della
sua foto — così non si torna mai a un `<img>` rotto.

## I 8 file (presenti in cartella, cablati su `image`)

Aggiornato 2026-10-30: batch nuovo, filename `item-<id>-<nome>.webp` (512x512). Via Schweppes
(item-049/050) e i vecchi `bevanda_*.webp`.

| Voce menu | id | Filename esatto |
|---|---|---|
| Acqua 0,5L | `item-038` | `item-038-acqua.webp` |
| Pepsi | `item-046` | `item-046-pepsi.webp` |
| Pepsi Zero | `item-047` | `item-047-pepsi-zero.webp` |
| Seven Up | `item-048` | `item-048-seven-up.webp` |
| Fanta | `item-063` | `item-063-fanta.webp` |
| Sprite | `item-064` | `item-064-sprite.webp` |
| Estathé Pesca | `item-065` | `item-065-estathe-pesca.webp` |
| Estathé Limone | `item-066` | `item-066-estathe-limone.webp` |

Path pubblico risultante: `/assets/kitchen/menu/bevande/<filename>`

## Requisiti immagine

- Formato `.webp` (stesso di panini/taglieri/cicchetti; le birre usano `.png` solo per ragioni
  storiche — per le bevande si sta su webp).
- Ratio e crop coerenti con `public/assets/kitchen/beers/`: bottiglia/lattina intera, verticale
  centrata, un solo prodotto per foto.
- **Fondo scuro pieno** in linea col tono Walrus (CLAUDE.md §8). Vietati: fondo bianco, scacchiera
  di trasparenza, alpha rotto, contorni ritagliati male.
- Nessun hotlink e nessun render di marchio scaricato da internet: sono prodotti a marchio terzo
  (Pepsi, Seven Up, Schweppes), le foto vanno scattate sulle bottiglie reali del locale.
- Peso consigliato < 150 KB per file (le card bevande sono sotto la piega, mobile-first).

## Scarto fra spec e batch consegnato (2026-09-16)

Due differenze fra quanto chiesto sopra e quanto e' arrivato. Nessuna delle due e' un
difetto visivo — le 6 foto sono coerenti fra loro e leggibili sulla card scura — ma vanno
registrate, perche' la spec qui sopra resta il riferimento per eventuali rifacimenti.

1. **Fondo scuro.** Le foto del batch 2026-10-30 hanno fondo scuro uniforme, in linea con la spec;
   il riquadro foto della card e' scuro (#2a1a10). Il vecchio token `--bv-photo-bg` (fondo chiaro
   #d9bd9c) non esiste piu'.
2. **Le lattine possono mostrare "33 cl" stampato.** Questo **non** e' usato per riempire il campo
   `format`: dedurre un dato di prodotto da un'immagine non e' una fonte. I formati restano
   quelli da confermare qui sotto; se Eros conferma, basta `format: '33 cl'` in `kitchenMockData.js`.

## Se una foto va rifatta

Sovrascrivere il file mantenendo lo stesso filename: `image` in `src/data/kitchenMockData.js`
punta al path, non al contenuto, quindi non serve toccare il codice.

## Aperto, non bloccante: formati non confermati

L'anatomia della card è `foto → nome → formato → prezzo → LO VOGLIO`, ma il campo `format` è
valorizzato solo dove il dato è confermato da una fonte nel repo:

| Voce | `format` | Fonte |
|---|---|---|
| Acqua | `0,5 L` | `description` in `kitchenMockData.js` + riga 1 di questa tabella |
| Pepsi | `33 cl` | il formato è nel nome (`Pepsi 33cl`) |
| Pepsi Zero | *assente* | **da confermare a Eros** |
| Seven Up | *assente* | **da confermare a Eros** |
| Fanta, Sprite, Estathé Pesca, Estathé Limone | *assente* | **da confermare a Eros** |

Nessun cl inventato (stessa regola già applicata a Krombacher, `format: null`): dove il formato
manca la riga non viene renderizzata, e il CSS le riserva comunque l'altezza così le card della
stessa riga restano allineate. Per attivarli basta aggiungere `format: '<valore>'` alla voce.
