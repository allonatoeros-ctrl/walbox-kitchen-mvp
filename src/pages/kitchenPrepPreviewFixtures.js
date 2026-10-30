// PASSIVE KDS V2 — dev-only fixture data for /kitchen/prep?preview=1.
// Same pattern as kitchenSoloPreviewFixtures.js: in-memory only, no localStorage, no Supabase,
// no network. Zero interaction on this board (it's a passive display), so no mutation helpers
// are needed here — just a realistic static scenario for the walkthrough.
//
// Scenario: 27 ordini, mix preparing/received, panini e patatine ripetuti su piu' ordini (per
// mostrare l'aggregazione TOP/BOTTOM), 2 tartare, 1 FALLO PESANTE (combo atomico), allergeni reali
// dal catalogo (glutine/latte/uova/senape) e un paio di note cliente, piu' un item non nel
// catalogo per esercitare il fallback "allergeni non verificati".
function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function o(orderCode, status, minutes, items, note = '') {
  return {
    id: `preview-prep-${orderCode}`,
    orderCode,
    status,
    createdAt: minutesAgo(minutes),
    note,
    items,
  };
}

function item(itemId, name, quantity) {
  return { itemId, name, quantity };
}

export function seedPrepPreviewOrders() {
  return [
    // ── PREPARING (12 ordini, 6 mostrati come ticket + 6 in overflow) ──────────────────────
    o('W41', 'preparing', 14, [item('item-009', 'Pulled Pork', 1), item('item-058', 'Patate al Forno', 1)]),
    o('W42', 'preparing', 13, [item('item-012', 'Crudo Vero', 2)], 'Senza cipolla'),
    o('W43', 'preparing', 12, [item('item-040', 'Pulled Pork — Fallo Pesante', 1)]),
    o('W44', 'preparing', 11, [item('item-020', 'Cruda e Contenta', 1), item('item-051', 'Birra del Tricheco', 1)]),
    o('W45', 'preparing', 10, [item('item-058', 'Patate al Forno', 3)]),
    o('W46', 'preparing', 9, [item('item-016', 'Wraptor', 1), item('item-021', 'Dolce ma Cruda', 1)], 'Allergia dichiarata al glutine'),
    o('W47', 'preparing', 8, [item('item-013', 'Panino 2', 1)]),
    o('W48', 'preparing', 7, [item('item-010', 'Pastrami', 1), item('item-058', 'Patate al Forno', 1)]),
    o('W49', 'preparing', 6, [item('item-034', 'Cicchetto', 2)]),
    o('W50', 'preparing', 5, [item('item-mystery-01', 'Piatto del giorno', 1)]),
    o('W51', 'preparing', 4, [item('item-011', 'Brisket', 1)]),
    o('W52', 'preparing', 3, [item('item-012', 'Crudo Vero', 1), item('item-058', 'Patate al Forno', 2)]),

    // ── RECEIVED / in coda (15 ordini, solo aggregato in CARICO IN ARRIVO) ─────────────────
    o('W53', 'received', 2, [item('item-041', 'Pastrami — Fallo Pesante', 1)]),
    o('W54', 'received', 2, [item('item-014', 'Panino 3', 2)]),
    o('W55', 'received', 3, [item('item-020', 'Cruda e Contenta', 1)]),
    o('W56', 'received', 3, [item('item-058', 'Patate al Forno', 1)], 'Senza sale'),
    o('W57', 'received', 4, [item('item-015', 'Panino 4', 1), item('item-053', 'Birra', 1)]),
    o('W58', 'received', 4, [item('item-009', 'Pulled Pork', 2)]),
    o('W59', 'received', 5, [item('item-035', 'Cicchetto', 1)]),
    o('W60', 'received', 5, [item('item-012', 'Crudo Vero', 1)]),
    o('W61', 'received', 6, [item('item-058', 'Patate al Forno', 2)]),
    o('W62', 'received', 6, [item('item-021', 'Dolce ma Cruda', 1)], 'Allergia dichiarata al glutine'),
    o('W63', 'received', 7, [item('item-016', 'Wraptor', 1)]),
    o('W64', 'received', 7, [item('item-042', 'Brisket — Fallo Pesante', 1)]),
    o('W65', 'received', 8, [item('item-017', 'Panino 5', 1), item('item-047', 'Acqua', 2)]),
    o('W66', 'received', 8, [item('item-010', 'Pastrami', 1)]),
    o('W67', 'received', 9, [item('item-058', 'Patate al Forno', 1)]),
  ];
}

/**
 * DEV-only preview: static scenario, in-memory only. This board has zero interaction (passive
 * KDS), so unlike kitchenSoloPreviewFixtures there is no mutation surface to seed here.
 */
export function usePreviewPrepOrders() {
  return { orders: seedPrepPreviewOrders() };
}
