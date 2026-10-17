import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_MODE_ON, isEventModeActive, isEventMenuItem, filterEventMenuItems, excludeEventOnlyItems, EVENT_CATEGORIES,
  EVENT_EXTRA_ITEM_IDS, EVENT_SIDE_ITEM_ID, shouldSuggestEventSide,
} from './kitchenEventMode.js';

test('spenta di default, senza flag né override', () => {
  assert.equal(isEventModeActive('', false), false);
  assert.equal(isEventModeActive(undefined, false), false);
  assert.equal(isEventModeActive('?altro=1', false), false);
});

test('il flag acceso la accende', () => {
  assert.equal(isEventModeActive('', true), true);
});

test('?evento=1 accende, ?evento=0 spegne anche a flag acceso', () => {
  assert.equal(isEventModeActive('?evento=1', false), true);
  assert.equal(isEventModeActive('?evento=0', true), false);
});

test('valori strani dell’override sono ignorati', () => {
  assert.equal(isEventModeActive('?evento=si', false), false);
  assert.equal(isEventModeActive('?evento=si', true), true);
});

test('menu evento: solo i panini bbq special, niente Box né altre categorie', () => {
  const items = [
    { id: 'a', category: 'bbq', tags: ['special', 'v2'] },
    { id: 'g', category: 'bbq', tags: ['special', 'v2', 'anniversario'] },
    { id: 'box', category: 'bbq', tags: ['v2'] },
    { id: 'p', category: 'panini', tags: ['special'] },
    { id: 'n', category: 'bbq' },
  ];
  assert.deepEqual(filterEventMenuItems(items).map((i) => i.id), ['a', 'g']);
  assert.equal(isEventMenuItem(null), false);
  assert.deepEqual(filterEventMenuItems(undefined), []);
});

test('menu evento: birre e bevande NON ci sono (decisione Eros 2026-10-16)', () => {
  const items = [
    { id: 'g', category: 'bbq', tags: ['special', 'anniversario'] },
    { id: 'b1', category: 'birre', tags: ['birre-v1'] },
    { id: 'd1', category: 'bevande', tags: ['drink'] },
    { id: 'd2', category: 'bevande' },
    { id: 'c', category: 'cicchetti', tags: ['special'] },
  ];
  assert.deepEqual(filterEventMenuItems(items).map((i) => i.id), ['g']);
  assert.deepEqual(EVENT_CATEGORIES, ['bbq', 'contorni']);
});

test('modalità spenta: il GARPEZ (tag anniversario) resta nel menu, gli altri restano identici', () => {
  const items = [
    { id: 'p', category: 'bbq', tags: ['special'] },
    { id: 'g', category: 'bbq', tags: ['special', 'anniversario'] },
    { id: 'x', category: 'birre' },
  ];
  assert.deepEqual(excludeEventOnlyItems(items).map((i) => i.id), ['p', 'g', 'x']);
  assert.deepEqual(excludeEventOnlyItems(undefined), []);
});

test('l\'interruttore è spento dopo la festa', () => {
  assert.equal(EVENT_MODE_ON, false);
  assert.equal(isEventModeActive(''), false);
});

test('menu evento: entrano anche Orto Cattivo (veg) e Patate al Forno, solo per id esplicito', () => {
  const items = [
    { id: 'item-013', category: 'panini', tags: ['veg', 'v2'] },
    { id: 'item-014', category: 'panini', tags: ['v2'] },
    { id: 'item-058', category: 'contorni', tags: ['veg', 'v2'] },
    { id: 'altro-contorno', category: 'contorni' },
    { id: 'g', category: 'bbq', tags: ['special', 'anniversario'] },
  ];
  assert.deepEqual(filterEventMenuItems(items).map((i) => i.id), ['item-013', 'item-058', 'g']);
  assert.deepEqual(EVENT_EXTRA_ITEM_IDS, ['item-013', 'item-058']);
  assert.equal(EVENT_SIDE_ITEM_ID, 'item-058');
});

test('modalità spenta: Orto Cattivo sparisce dal menu normale, Patate restano', () => {
  const items = [
    { id: 'item-013', category: 'panini', tags: ['veg', 'v2'] },
    { id: 'item-058', category: 'contorni', tags: ['veg', 'v2'] },
  ];
  assert.deepEqual(excludeEventOnlyItems(items).map((i) => i.id), ['item-058']);
});

test('chip patate: solo con un panino nel sacco, senza patate e senza un no', () => {
  const sandwichIds = ['g', 'item-013'];
  const base = { sandwichIds, sideAvailable: true, dismissed: false };
  assert.equal(shouldSuggestEventSide({ ...base, cartIds: [] }), false);
  assert.equal(shouldSuggestEventSide({ ...base, cartIds: ['birra'] }), false);
  assert.equal(shouldSuggestEventSide({ ...base, cartIds: ['g'] }), true);
  assert.equal(shouldSuggestEventSide({ ...base, cartIds: ['item-013', 'birra'] }), true);
  assert.equal(shouldSuggestEventSide({ ...base, cartIds: ['g', 'item-058'] }), false);
  assert.equal(shouldSuggestEventSide({ ...base, cartIds: ['g'], dismissed: true }), false);
  assert.equal(shouldSuggestEventSide({ ...base, cartIds: ['g'], sideAvailable: false }), false);
  assert.equal(shouldSuggestEventSide({}), false);
});
