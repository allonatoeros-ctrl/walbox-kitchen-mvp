function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

export const kitchenOrderStatuses = {
  received: { label: 'Ricevuto', color: '#f59e0b' },
  preparing: { label: 'In preparazione', color: '#3b82f6' },
  ready: { label: 'Pronto', color: '#10b981' },
  delivered: { label: 'Consegnato', color: '#6b7280' },
  cancelled: { label: 'Annullato', color: '#ef4444' },
  pending_counter_payment: { label: 'In attesa pagamento', color: '#c8960a' },
};

export const kitchenMenuItems = [
  // nuovi panini V2
  {
    id: 'item-012',
    name: 'Crudo Vero',
    category: 'panini',
    description: 'Non deve piacere a tutti. Per fortuna.',
    price: 8.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/panini/panino_carne_cruda.webp',
    available: true,
    ingredients: 'Carne cruda, rucola, senape in grani, raspadura, olio e limone.',
    allergens: ['senape'],
  },
  {
    id: 'item-013',
    name: 'Orto Cattivo',
    category: 'panini',
    description: 'Panino vegetariano con verdure di stagione.',
    price: 8.0,
    points: null,
    tags: ['veg', 'v2'],
    image: '/assets/kitchen/menu/panini/panino_orto_cattivo.webp',
    available: true,
    ingredients: 'Pomodoro, zucchine e melanzane grigliate, maionese al basilico, stracciatella.',
    allergens: ['latte', 'uova'],
  },
  {
    id: 'item-014',
    name: 'Crudo Ma Educato',
    category: 'panini',
    description: 'Delicato solo in apparenza.',
    price: 8.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/panini/panino_crudo.webp',
    available: true,
    ingredients: 'Crudo, pomodoro, songino e maionese.',
    allergens: ['uova'],
  },
  {
    id: 'item-015',
    name: 'Specktacolo',
    category: 'panini',
    description: 'Cremoso, saporito. Nessuna timidezza.',
    price: 8.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/panini/panino_speck.webp',
    available: true,
    ingredients: 'Speck, boscaiola, taleggio, zucchine.',
    allergens: ['latte'],
  },
  {
    id: 'item-016',
    name: 'Wraptor',
    category: 'panini',
    description: 'Sembra quello tranquillo. Sembra.',
    price: 8.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/panini/chicken_wrap.webp',
    available: true,
    ingredients: 'Piadina, pollo, bacon, lattuga, raspadura, salsa Caesar.',
    allergens: ['glutine', 'latte', 'uova'],
  },
  {
    id: 'item-017',
    name: 'Mortazza Classe Alta',
    category: 'panini',
    description: 'Cremoso, ricco, arrogante il giusto.',
    price: 8.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/panini/panino_mortazza_piatto.webp',
    available: true,
    ingredients: 'Mortadella, pesto di pistacchi, stracciatella e pomodoro confit.',
    allergens: ['latte', 'frutta_secca'],
  },
  {
    id: 'item-032',
    name: 'Porca Figura',
    category: 'panini',
    description: 'Quando la fame smette di essere educata.',
    price: 8.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/panini/panino_porchetta.webp',
    available: true,
    ingredients: 'Porchetta, peperoni, melanzane, scamorza, salsa BBQ.',
    allergens: ['latte'],
  },
  // BIRRE — BEER SPRINT V1 (2026-09-14, ai-ops/current/BEER_SPRINT_V1.md §2/§3).
  // Dati confermati (prezzo/formato): 6 bottiglie, tutte disponibili tutto il giorno
  // (`availability: 'all_day'`). `choiceLabel`/`tasteSignals` sono copy di prodotto
  // per la choice architecture (decisione Eros §3), non dati di business: modificabili
  // senza migration. Asset fotografici reali in `public/assets/kitchen/beers/`
  // (BEER_SPRINT_V1, wiring 2026-09-14).
  //
  // MENU POLISH & STORYTELLING SPRINT (2026-09-16): aggiunto il campo `story` —
  // copy approvato da Eros, mostrato solo nello stato EXPANDED della card
  // (BirreSection.jsx). Puramente descrittivo/sensoriale: nessun dato tecnico
  // (ABV, IBU, birrificio, stile ufficiale) perché non confermato da nessuna fonte.
  // `format`, `price`, `availability` e `allergens` restano i dati reali di servizio
  // e non sono stati toccati.
  {
    id: 'item-051',
    name: 'Keiler Helles',
    category: 'birre',
    description: 'Bionda classica, morbida e facile da bere. Non delude mai.',
    price: 6.0,
    points: null,
    tags: ['drink', 'v2', 'birre-v1'],
    image: '/assets/kitchen/beers/keiler-helles.png',
    available: true,
    format: '50 cl',
    choiceLabel: 'VAI SUL SICURO',
    story: 'Morbida, pulita, facile da bere. La bionda che non deve dimostrare niente.',
    tasteSignals: ['Morbida', 'Fresca'],
    availability: 'all_day',
    ingredients: 'Birra in bottiglia, 50 cl.',
    allergens: ['glutine'],
  },
  {
    id: 'item-052',
    name: 'Keiler Land-Pils',
    category: 'birre',
    description: 'Pils più secca, per chi non cerca la via morbida.',
    price: 6.0,
    points: null,
    tags: ['drink', 'v2', 'birre-v1'],
    image: '/assets/kitchen/beers/keiler-land-pils.png',
    available: true,
    format: '50 cl',
    choiceLabel: 'PIÙ SECCA',
    story: 'Più secca e più dritta. Finale amaro pulito.',
    tasteSignals: ['Secca', 'Pulita'],
    availability: 'all_day',
    ingredients: 'Birra in bottiglia, 50 cl.',
    allergens: ['glutine'],
  },
  {
    id: 'item-053',
    name: 'Keiler Kellerbier',
    category: 'birre',
    description: 'Non filtrata, grezza il giusto.',
    price: 6.0,
    points: null,
    tags: ['drink', 'v2', 'birre-v1'],
    image: '/assets/kitchen/beers/keiler-kellerbier.png',
    available: true,
    format: '50 cl',
    choiceLabel: 'NON FILTRATA',
    story: 'Rustica, maltata, da pub. Pane e carattere.',
    tasteSignals: ['Non filtrata', 'Rustica'],
    availability: 'all_day',
    ingredients: 'Birra in bottiglia, 50 cl.',
    allergens: ['glutine'],
  },
  {
    id: 'item-054',
    name: 'Keiler Weisse',
    category: 'birre',
    description: 'Frutta in superficie, niente di tecnico.',
    price: 6.0,
    points: null,
    tags: ['drink', 'v2', 'birre-v1'],
    image: '/assets/kitchen/beers/keiler-weisse.png',
    available: true,
    format: '50 cl',
    choiceLabel: 'FRUTTATA',
    story: 'Morbida e aromatica, tipica birra di frumento.',
    tasteSignals: ['Fruttata', 'Leggera'],
    availability: 'all_day',
    ingredients: 'Birra in bottiglia, 50 cl.',
    allergens: ['glutine'],
  },
  {
    id: 'item-055',
    name: 'Keiler Dunkel Weisse',
    category: 'birre',
    description: 'Scura e corposa. Non per un assaggio veloce.',
    price: 6.0,
    points: null,
    tags: ['drink', 'v2', 'birre-v1'],
    image: '/assets/kitchen/beers/keiler-dunkel-weisse.png',
    available: true,
    format: '50 cl',
    choiceLabel: 'SCURA & CORPOSA',
    story: 'Più maltata e profonda, ma ancora facile da bere.',
    tasteSignals: ['Scura', 'Corposa'],
    availability: 'all_day',
    ingredients: 'Birra in bottiglia, 50 cl.',
    allergens: ['glutine'],
  },
  {
    id: 'item-056',
    name: 'Lupulus',
    category: 'birre',
    description: 'Intensa, luppolata, senza sconti.',
    price: 6.0,
    points: null,
    tags: ['drink', 'v2', 'birre-v1'],
    image: '/assets/kitchen/beers/lupulus-blonde.png',
    available: true,
    format: '33 cl',
    choiceLabel: 'INTENSA',
    story: 'Belga, profumata e più intensa. Parte elegante, poi si fa sentire.',
    tasteSignals: ['Intensa', 'Luppolata'],
    availability: 'all_day',
    ingredients: 'Birra in bottiglia, 33 cl.',
    allergens: ['glutine'],
  },
  // Krombacher alla spina — solo la sera (§3 missione, BEER SPRINT V1 Fase E, 2026-09-14).
  // Prezzo confermato da Eros: €6. Formato in cl NON confermato: `format` resta null
  // (nessun dato inventato), `choiceLabel: 'ALLA SPINA'` copre la richiesta di mostrare
  // "alla spina" dove il formato non c'è (unico punto che rende `item.format` in
  // BirreSection.jsx). Orderable ora solo la sera (gate 18:00 già esistente da Fase B,
  // confermato come soglia definitiva da Eros in questa fase).
  {
    id: 'item-057',
    name: 'Krombacher Pils',
    category: 'birre',
    description: 'Alla spina, solo la sera.',
    price: 6.0,
    points: null,
    tags: ['drink', 'v2', 'birre-v1'],
    image: '/assets/kitchen/beers/krombacher-pils.png',
    available: true,
    format: null,
    choiceLabel: 'ALLA SPINA',
    story: 'Alla spina, fresca e secca. Una Pils dritta e senza complicazioni.',
    tasteSignals: [],
    availability: 'evening_only',
    ingredients: 'Birra alla spina.',
    allergens: ['glutine'],
  },
  // AMERICAN BBQ (remapped da special)
  {
    id: 'item-009',
    name: 'Pulled Pork',
    category: 'bbq',
    description: 'Disordinato, esagerato, meravigliosamente fuori controllo.',
    price: 13.9,
    points: null,
    tags: ['special', 'v2'],
    image: '/assets/kitchen/photo-pulled-pork-special.webp',
    available: true,
    ingredients: '100 g carne · coleslaw · anelli di cipolla · salsa cheddar · maionese al pepe',
    allergens: ['uova', 'latte'],
  },
  {
    id: 'item-010',
    name: 'Pastrami',
    category: 'bbq',
    description: 'Affumicato, dolce, acido. Si fa ricordare.',
    price: 14.5,
    points: null,
    tags: ['special', 'v2'],
    image: '/assets/kitchen/photo-pastrami-special.webp',
    available: true,
    ingredients: '120 g carne · cetriolo sott’aceto · cheddar · honey mustard',
    allergens: ['latte', 'senape'],
  },
  {
    id: 'item-011',
    name: 'Brisket',
    category: 'bbq',
    description: 'Fumo, sostanza e cattive intenzioni.',
    price: 15.0,
    points: null,
    tags: ['special', 'v2'],
    image: '/assets/kitchen/photo-brisket-special.webp',
    available: true,
    ingredients: '120 g brisket · provola affumicata · coleslaw · cetrioli sott’aceto · salsa BBQ',
    allergens: ['latte', 'uova'],
  },
  // BOX (standalone speciale, categoria bbq — no FALLO PESANTE: nessuna entry in kitchenPesiMassimiCombos)
  // MENU POLISH SPRINT (2026-09-16, decisione Eros): resta dentro PESI MASSIMI ma non va
  // MAI chiamato panino. `detailCtaLabel`/`priceNote` sono override di copy opzionali letti
  // da PesiMassimiSection.jsx: assenti sugli altri item bbq → fallback "VEDI IL PANINO" /
  // "SOLO PANINO" invariato. Nessun id hardcoded nel componente.
  {
    id: 'item-018',
    name: 'Box Pulled Pork',
    category: 'bbq',
    description: 'Pulled Pork in box take away.',
    price: 11.5,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/box/box-pulled-pork.png',
    available: true,
    detailCtaLabel: 'VEDI IL BOX',
    priceNote: 'SOLO BOX',
    ingredients: 'Pulled pork senza pane · patate al forno · anelli di cipolla · salsa cheddar · maionese al pepe',
    allergens: [],
  },
  // TARTARE
  {
    id: 'item-020',
    name: 'Cruda e Contenta',
    category: 'tartare',
    description: 'Cruda, cremosa e senza bisogno di presentazioni.',
    price: 12.5,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/tartare/tartare_1.webp',
    available: true,
    ingredients: 'Carne, maionese al basilico, stracciatella, pomodoro confit.',
    allergens: ['latte', 'uova'],
  },
  {
    id: 'item-021',
    name: 'Dolce ma Cruda',
    category: 'tartare',
    description: 'Pochi fronzoli. La carne parla da sola.',
    price: 10.5,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/tartare/tartare_2.webp',
    available: true,
    ingredients: 'Carne, maionese al miele, rucola, raspadura.',
    allergens: ['latte', 'uova'],
  },
  // CICCHETTI
  {
    id: 'item-034',
    name: 'Mortazza',
    category: 'cicchetti',
    description: 'Morbido. Cremoso. Pericolosamente buono.',
    price: 5.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/cicchetti/cicchetto_mortazza.webp',
    available: true,
    ingredients: 'Pane, mortadella, stracciatella, pomodoro confit.',
    allergens: ['glutine', 'latte'],
  },
  {
    id: 'item-035',
    name: 'Lardo & Noci',
    category: 'cicchetti',
    description: 'Pochi ingredienti. Tanto carattere.',
    price: 5.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/cicchetti/cicchetto_lardo_noci.webp',
    available: true,
    ingredients: 'Pane, lardo, noci, miele.',
    allergens: ['glutine', 'frutta_secca'],
  },
  {
    id: 'item-036',
    name: 'Scamorza & Cipolle',
    category: 'cicchetti',
    description: 'Dolce, affumicato, irresistibile.',
    price: 6.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/cicchetti/cicchetto_scamorza_cipolle_v2.webp',
    available: true,
    ingredients: 'Pane, scamorza, speck, marmellata di cipolle rosse.',
    allergens: ['glutine', 'latte'],
  },
  {
    id: 'item-037',
    name: 'Cicchetto Veg',
    category: 'cicchetti',
    description: 'Vegano sì, ma con grinta.',
    price: 5.0,
    points: null,
    tags: ['veg', 'v2'],
    image: '/assets/kitchen/menu/cicchetti/cicchetto_ciappi_veg.webp',
    available: true,
    ingredients: 'Pane, zucchine, melanzane, tofu, peperoni, teriyaki.',
    allergens: ['glutine', 'soia'],
  },
  // INSALATONE
  {
    id: 'item-024',
    name: 'Caesar',
    category: 'insalatone',
    description: 'Il grande classico. Sempre una scelta giusta.',
    price: 10.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/insalatone/insalatona_caesar.webp',
    available: true,
    ingredients: 'Lattughino, pollo, bacon, raspadura, crostini di pane, salsa Caesar.',
    allergens: ['glutine', 'latte'],
  },
  {
    id: 'item-025',
    name: 'Salmon',
    category: 'insalatone',
    description: 'Fresca, leggera, con il giusto twist.',
    price: 12.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/insalatone/insalatona_salmon.webp',
    available: true,
    ingredients: 'Songino, salmone, avocado, pomodoro, salsa yogurt, sesamo.',
    allergens: ['pesce', 'latte', 'sesamo'],
  },
  {
    id: 'item-027',
    name: 'Veggy',
    category: 'insalatone',
    description: 'Colorata, vegetale, per niente triste.',
    price: 10.0,
    points: null,
    tags: ['veg', 'v2'],
    image: '/assets/kitchen/menu/insalatone/insalatona_veggy.webp',
    available: true,
    ingredients: 'Songino, lattughino, pomodoro, zucchine, melanzane, tofu, teriyaki.',
    allergens: ['soia'],
  },
  {
    id: 'item-038',
    name: 'Acqua',
    category: 'bevande',
    description: 'Acqua naturale o frizzante, 0,5L.',
    price: 1.0,
    points: null,
    tags: ['drink'],
    image: '/assets/kitchen/menu/bevande/bevanda_acqua.webp',
    format: '0,5 L',
    available: true,
    ingredients: 'Acqua.',
    allergens: [],
  },
  // TAGLIERI — 1 sola categoria/tab cliente ('tagliere', decisione Eros 2026-09-10: niente tab
  // separate), 3 voci raggruppate insieme in MENU_CATEGORIES (CustomerKitchenMenu.jsx).
  // MENU POLISH & STORYTELLING SPRINT (2026-09-16): `description` sostituita con il copy
  // approvato da Eros, mostrato nello stato EXPANDED di TagliereSection.jsx. `ingredients`,
  // `price`, `image` e `allergens` invariati — `ingredients` resta la riga tecnica completa
  // (include miele/marmellata di cipolle, che il copy non nomina).
  {
    id: 'item-043',
    name: 'Salumi Serissimi',
    category: 'tagliere',
    description: 'Crudo, lardo, mortadella e speck. Serissimi solo nel nome: questo è il tagliere da mettere in mezzo e far sparire.',
    price: 8.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/tagliere/tagliere_salumi_serissimi.webp',
    available: true,
    ingredients: 'Crudo, lardo, mortadella, speck.',
    allergens: [],
  },
  {
    id: 'item-044',
    name: 'Formaggi Discutibili',
    category: 'tagliere',
    description: 'Taleggio, pecorino, scamorza e raspadura. Quattro caratteri diversi, nessuna intenzione di mettersi d’accordo.',
    price: 8.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/tagliere/tagliere_formaggi_discutibili.webp',
    available: true,
    ingredients: 'Taleggio, pecorino, scamorza, raspadura, stracciatella, servito con miele e marmellata di cipolle.',
    allergens: ['latte'],
  },
  {
    id: 'item-045',
    name: 'Pace Fatta',
    category: 'tagliere',
    description: 'Salumi e formaggi nello stesso tagliere, pensato per due. Quando discutere non serve più: si ordina tutto.',
    price: 10.0,
    points: null,
    tags: ['v2'],
    image: '/assets/kitchen/menu/tagliere/tagliere_pace_fatta.webp',
    available: true,
    ingredients: 'Crudo, lardo, mortadella, speck, taleggio, pecorino, scamorza, raspadura, stracciatella, servito con miele e marmellata di cipolle.',
    allergens: ['latte'],
  },
  // BEVANDE — categoria esposta in MENU_CATEGORIES; voci senza prezzo restano non
  // ordinabili (PREZZO IN ARRIVO), nessun prezzo/marca inventati.
  //
  // MENU POLISH SPRINT (2026-09-16) — WIRING ASSET COMPLETATO.
  // Il batch fotografico è arrivato: i 6 file reali sono in
  // public/assets/kitchen/menu/bevande/ (512×512 .webp, spec nel README della cartella)
  // e `image` punta ora al path definitivo di ciascuno. Il campo ponte `imagePending`,
  // che teneva il path dichiarato finché i file non esistevano, è stato rimosso: non
  // serve più e lasciarlo sarebbe dato morto. Nessun hotlink a marchi terzi, nessun
  // placeholder generato — le foto sono scatti sui prodotti reali del locale.
  //
  // `format` = riga formato della card cliente (BevandeSection.jsx). Valorizzato SOLO dove
  // il dato è confermato da una fonte nel repo: Acqua (`description` + README asset) e
  // Pepsi 33cl (il formato è nel nome). Per Pepsi Zero / Seven Up / Schweppes il formato
  // non è confermato da nessuna fonte: resta assente e la riga non viene renderizzata —
  // stessa regola già applicata a Krombacher (`format: null`, nessun cl inventato).
  // `displayName` è un override di sola UI menu: il nome reale (usato da carrello, ordine
  // e staff) resta `name`. Serve solo a Pepsi 33cl, che altrimenti ripeterebbe "33cl"
  // nel titolo e nella riga formato subito sotto.
  {
    id: 'item-046',
    name: 'Pepsi 33cl',
    displayName: 'Pepsi',
    category: 'bevande',
    description: 'Bibita analcolica gassata.',
    price: 4.0,
    points: null,
    tags: ['drink'],
    image: '/assets/kitchen/menu/bevande/bevanda_pepsi.webp',
    format: '33 cl',
    available: true,
    ingredients: 'Bibita analcolica gassata.',
    allergens: [],
  },
  {
    id: 'item-047',
    name: 'Pepsi Zero',
    category: 'bevande',
    description: 'Bibita analcolica gassata.',
    price: 4.0,
    points: null,
    tags: ['drink'],
    image: '/assets/kitchen/menu/bevande/bevanda_pepsi_zero.webp',
    available: true,
    ingredients: 'Bibita analcolica gassata.',
    allergens: [],
  },
  {
    id: 'item-048',
    name: 'Seven Up',
    category: 'bevande',
    description: 'Bibita analcolica gassata.',
    price: 4.0,
    points: null,
    tags: ['drink'],
    image: '/assets/kitchen/menu/bevande/bevanda_seven_up.webp',
    available: true,
    ingredients: 'Bibita analcolica gassata.',
    allergens: [],
  },
  {
    id: 'item-049',
    name: 'Schweppes Lemon',
    category: 'bevande',
    description: 'Bibita analcolica gassata.',
    price: 4.0,
    points: null,
    tags: ['drink'],
    image: '/assets/kitchen/menu/bevande/bevanda_schweppes_lemon.webp',
    available: true,
    ingredients: 'Bibita analcolica gassata.',
    allergens: [],
  },
  {
    id: 'item-050',
    name: 'Schweppes Tonica',
    category: 'bevande',
    description: 'Bibita analcolica gassata.',
    price: 4.0,
    points: null,
    tags: ['drink'],
    image: '/assets/kitchen/menu/bevande/bevanda_schweppes_tonica.webp',
    available: true,
    ingredients: 'Bibita analcolica gassata.',
    allergens: [],
  },
  // CONTORNI — MENU CLEANUP + PRICE SPRINT (2026-09-15, prezzo confermato da Eros).
  // Asset fotografico ancora pending: `image: null`, stesso fallback visivo già in
  // uso per Acqua/Pepsi/ecc. Non ancora aggiunta a `MENU_CATEGORIES` (nav cliente):
  // servirebbe una nuova icona categoria (CATEGORY_SVGS) mai disegnata, fuori scope
  // di questo sprint (solo dati/prezzi) — item presente in catalogo/staff, non
  // ancora navigabile/ordinabile dal cliente in attesa di decisione Eros.
  {
    id: 'item-058',
    name: 'Patate al Forno',
    category: 'contorni',
    description: 'Patate al forno, standalone.',
    price: 5.0,
    points: null,
    tags: ['veg', 'v2'],
    image: null,
    available: true,
    ingredients: 'Patate al forno.',
    allergens: [],
  },
];

// ── PESI MASSIMI — combo "FALLO PESANTE" ────────────────────────────────
// NON fanno parte di `kitchenMenuItems`: non devono mai comparire come prodotto
// standalone nel catalogo/menu. Sono ordinabili solo dalla CTA FALLO PESANTE del
// relativo Peso Massimo (PesiMassimiSection), tramite lo stesso addItem/payload ordine.
export const kitchenPesiMassimiCombos = {
  'item-009': {
    id: 'item-040',
    name: 'Pulled Pork — Fallo Pesante',
    subtitle: 'PANINO + BIRRA + PATATE AL FORNO',
    price: 19.0,
    image: '/assets/kitchen/photo-pulled-pork-special.webp',
  },
  'item-010': {
    id: 'item-041',
    name: 'Pastrami — Fallo Pesante',
    subtitle: 'PANINO + BIRRA + PATATE AL FORNO',
    price: 20.0,
    image: '/assets/kitchen/photo-pastrami-special.webp',
  },
  'item-011': {
    id: 'item-042',
    name: 'Brisket — Fallo Pesante',
    subtitle: 'PANINO + BIRRA + PATATE AL FORNO',
    price: 20.0,
    image: '/assets/kitchen/photo-brisket-special.webp',
  },
};

export const demoKitchenOrders = [
  {
    id: 'order-001',
    orderCode: 'W40',
    nickname: 'Gamba Lunga',
    items: [
      { itemId: 'item-018', name: 'Box Pulled Pork', quantity: 2, price: 11.5 },
    ],
    total: 23.0,
    status: 'preparing',
    createdAt: minutesAgo(40),
    note: 'Senza cipolla sul panino, per favore.',
  },
  {
    id: 'order-002',
    orderCode: 'W41',
    nickname: 'Sabrina87',
    items: [
      { itemId: 'item-016', name: 'Wraptor', quantity: 1, price: 8.0 },
      { itemId: 'item-051', name: 'Keiler Helles', quantity: 2, price: 6.0 },
    ],
    total: 20.0,
    status: 'ready',
    readyAt: minutesAgo(12),
    createdAt: minutesAgo(55),
    note: '',
  },
  {
    id: 'order-003',
    orderCode: 'W43',
    nickname: 'IlCapo',
    items: [
      { itemId: 'item-015', name: 'Specktacolo', quantity: 1, price: 8.0 },
      { itemId: 'item-052', name: 'Keiler Land-Pils', quantity: 1, price: 6.0 },
    ],
    total: 14.0,
    status: 'received',
    createdAt: minutesAgo(18),
    note: 'Patatine extra croccanti se possibile.',
    staffNote: 'Cliente ha confermato allergia al latte — preparare separato.',
  },
  {
    id: 'order-004',
    orderCode: 'W42',
    nickname: 'MarcoCavallo',
    items: [
      { itemId: 'item-032', name: 'Porca Figura', quantity: 1, price: 8.0 },
      { itemId: 'item-058', name: 'Patate al Forno', quantity: 1, price: 5.0 },
    ],
    total: 13.0,
    status: 'ready',
    paymentStatus: 'paid',
    paymentMethod: 'counter',
    paidAt: minutesAgo(68),
    readyAt: minutesAgo(55),
    createdAt: minutesAgo(70),
    note: '',
  },
  {
    id: 'order-005',
    orderCode: 'W44',
    nickname: 'FuriosaDelBanco',
    items: [
      { itemId: 'item-018', name: 'Box Pulled Pork', quantity: 1, price: 11.5 },
      { itemId: 'item-058', name: 'Patate al Forno', quantity: 1, price: 5.0 },
    ],
    total: 16.5,
    status: 'delivered',
    paymentStatus: 'paid',
    paymentMethod: 'counter',
    createdAt: minutesAgo(95),
    readyAt: minutesAgo(80),
    paidAt: minutesAgo(82),
    note: '',
  },
  {
    id: 'order-006',
    orderCode: 'W45',
    nickname: 'SpartatoViaSubito',
    items: [
      { itemId: 'item-032', name: 'Porca Figura', quantity: 1, price: 8.0 },
      { itemId: 'item-051', name: 'Keiler Helles', quantity: 1, price: 6.0 },
    ],
    total: 14.0,
    status: 'cancelled',
    createdAt: minutesAgo(115),
    note: 'Cliente se ne è andato prima di pagare.',
  },
];

export const kitchenCategoryPromos = {
  // Legacy hero baked "COMBO PORCHERIA SERIA — €14,90" (item/prezzo inesistenti oggi) — rimossa,
  // niente asset sostitutivo coerente disponibile senza generare nuove immagini.
  panini: null,
  patatine: {
    image: '/assets/kitchen/07_fries_promo_fritto_terapeutico.webp',
    alt: 'Fritto terapeutico',
  },
  combo: null,
  // bbq resta null: la categoria PESI MASSIMI ha già il proprio hero in
  // PesiMassimiSection e CustomerKitchenMenu esclude esplicitamente `bbq`
  // dalla promo hero card — una entry qui sarebbe dato morto.
  bbq: null,
  box: null,
  tartare: null,
  tagliere: null,
  bevande: null,
  insalatone: null,
  bruschette: null,
  cicchetti: null,
};

// AUTO-SELLING V1 — BEER SPRINT V1 (ai-ops/current/BEER_SPRINT_V1.md §5/§7-D).
// Matrice configurabile food/categoria → birra consigliata. "1 contesto → 1
// suggerimento principale": nessun motore di raccomandazione, nessuna lista di
// alternative. Priorità di lookup: `byItem[itemId]` (override puntuale) prima di
// `byCategory[category]` (default). I pairing sono un'ipotesi prodotto iniziale
// (§5 missione), non verità immutabile — cambiabili qui senza toccare la logica
// che li legge (CustomerKitchenMenu.jsx). Krombacher (item-057) volutamente
// assente: non ordinabile finché formato/prezzo non sono confermati.
export const kitchenBeerPairing = {
  byItem: {},
  byCategory: {
    panini: 'item-051',      // Helles — panini standard
    cicchetti: 'item-052',   // Land-Pils — prodotti più grassi/intensi
    bbq: 'item-056',         // Lupulus — Pesi Massimi
    tagliere: 'item-053',    // Kellerbier — salumi/taglieri
    insalatone: 'item-054',  // Weisse — piatti più freschi
    tartare: 'item-054',     // Weisse — piatti più freschi
  },
};
