# Asset Inventory Audit

Workflow read-only per mappare gli asset di una pagina prodotto prima del layout polish.
Invocazione: `/asset-inventory-audit` (default: Kitchen) oppure `/asset-inventory-audit <pagina> <mockData> <cartella-asset>`.

## Scope di default (Kitchen)
Se non vengono passati path nell'invocazione, usa questi:
- `src/pages/CustomerKitchenMenu.jsx`
- `src/data/kitchenMockData.js`
- `public/assets/kitchen/`

## Vincoli
- **READ-ONLY assoluto.** Questo workflow non modifica nessun file.
- Leggi SOLO i tre target sopra (o quelli passati). Niente repo scan, niente file fuori scope.
- Se serve un file non in scope: fermati e segnalalo, non aprirlo.
- Valgono le regole di `.agents/rules/scope-discipline.md`.

## Passi

1. **Leggi i menu item.** Da `kitchenMockData.js` estrai l'elenco completo dei prodotti del menu (nome + eventuale chiave/id usata nel codice).

2. **Inventario asset, in DUE famiglie separate.** Nella cartella asset distingui:
   - **Reference di layout/design** = file numerati (es. `00_style_anchor_board.png` … `08_bottom_cart_dock.png`). Servono come guida UI, NON sono foto prodotto.
   - **Foto prodotto** = file `photo-*.png` (es. `photo-walrus-classic.png`). Sono gli asset mappabili sui menu item.
   Elenca le due liste separatamente.

3. **Mappatura foto → prodotto.** Per ogni menu item indica se esiste una `photo-*` plausibilmente corrispondente, e con quale grado di certezza (sicuro / probabile / incerto). Mostra il nome esatto del file.

4. **Prodotti ancora in fallback.** Elenca i menu item che nel codice usano un'immagine di fallback / placeholder invece di una foto reale.

5. **Prodotti mappabili subito.** Elenca i menu item per cui la foto **esiste già** nella cartella ma **non è ancora collegata** nel codice (quick win di implementazione).

6. **Asset mancanti da creare.** Elenca i menu item per cui **non esiste** alcuna foto: vanno prodotti.

7. **Scrivi l'esito nel ticket.** Inserisci tutto nella sezione `## Audit` del ticket attivo in `ai-ops/tickets/`. Non creare report sparsi.

8. **Proponi il prompt implementativo successivo.** Prepara un prompt ACT pronto all'uso che colleghi i "prodotti mappabili subito" (passo 5), con scope esplicito (`Modify only: ...`) e divieti, senza eseguirlo.

## Output finale (formato compatto)
```
## Audit — Asset Inventory (<data>)

Menu item totali: N

Reference layout (non mappabili): [lista file numerati]
Foto prodotto disponibili: [lista photo-*]

Mappatura:
- <prodotto> → <photo-file> (sicuro/probabile/incerto)
- ...

In fallback: [lista prodotti senza foto collegata]
Mappabili subito (foto c'è, non collegata): [lista]
Asset mancanti da creare: [lista prodotti senza foto]

Prossimo prompt ACT proposto:
<blocco prompt pronto>
```
