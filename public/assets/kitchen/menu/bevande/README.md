# ASSET BEVANDE — SPEC DI PRODUZIONE

MENU POLISH SPRINT, 2026-09-16. **Batch fotografico consegnato e cablato.** I 6 file sono in
questa cartella (512×512 `.webp`) e `image` in `src/data/kitchenMockData.js` punta al path
definitivo di ciascuno. Il campo ponte `imagePending` è stato rimosso: non serve più.

La card cliente (`src/components/kitchen/BevandeSection.jsx`) mantiene comunque il ramo
placeholder "FOTO IN ARRIVO" come fallback per una voce bevanda futura aggiunta prima della
sua foto — così non si torna mai a un `<img>` rotto.

## I 6 file (presenti in cartella, cablati su `image`)

| # | Voce menu | id | Filename esatto |
|---|---|---|---|
| 1 | Acqua 0,5L | `item-038` | `bevanda_acqua.webp` |
| 2 | Pepsi 33cl | `item-046` | `bevanda_pepsi.webp` |
| 3 | Pepsi Zero | `item-047` | `bevanda_pepsi_zero.webp` |
| 4 | Seven Up | `item-048` | `bevanda_seven_up.webp` |
| 5 | Schweppes Lemon | `item-049` | `bevanda_schweppes_lemon.webp` |
| 6 | Schweppes Tonica | `item-050` | `bevanda_schweppes_tonica.webp` |

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

1. **Fondo chiaro, non scuro.** I requisiti chiedevano "fondo scuro pieno"; le foto sono su
   un banco caldo chiaro (bordi ~`#d9bd9c`). Di conseguenza `--bv-photo-bg` in
   `BevandeSection.css` e' stato portato su quel tono, per non avere un flash scuro→chiaro
   durante il caricamento. Se un rifacimento futuro tornasse al fondo scuro, quel token va
   riportato a un tono scuro.
2. **Le lattine mostrano "33 cl" stampato.** Su Pepsi Zero, Seven Up, Schweppes Lemon e
   Schweppes Tonica il formato e' leggibile nella foto. Questo **non** e' stato usato per
   riempire il campo `format`: dedurre un dato di prodotto da un'immagine non e' una fonte,
   e i 4 formati restano quelli da confermare nella sezione qui sotto. Se Eros conferma che
   sono 33 cl, bastano 4 righe `format: '33 cl'` in `kitchenMockData.js`.

## Se una foto va rifatta

Sovrascrivere il file mantenendo lo stesso filename: `image` in `src/data/kitchenMockData.js`
punta al path, non al contenuto, quindi non serve toccare il codice.

## Aperto, non bloccante: 4 formati su 6 non confermati

L'anatomia della card è `foto → nome → formato → prezzo → LO VOGLIO`, ma il campo `format` è
valorizzato solo dove il dato è confermato da una fonte nel repo:

| Voce | `format` | Fonte |
|---|---|---|
| Acqua | `0,5 L` | `description` in `kitchenMockData.js` + riga 1 di questa tabella |
| Pepsi | `33 cl` | il formato è nel nome (`Pepsi 33cl`) |
| Pepsi Zero | *assente* | **da confermare a Eros** |
| Seven Up | *assente* | **da confermare a Eros** |
| Schweppes Lemon | *assente* | **da confermare a Eros** |
| Schweppes Tonica | *assente* | **da confermare a Eros** |

Nessun cl inventato (stessa regola già applicata a Krombacher, `format: null`): dove il formato
manca la riga non viene renderizzata, e il CSS le riserva comunque l'altezza così le card della
stessa riga restano allineate. Per attivarli basta aggiungere `format: '<valore>'` alla voce.
