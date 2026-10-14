import test from 'node:test';
import assert from 'node:assert/strict';
import { isEventModeActive, isEventMenuItem, filterEventMenuItems, isEventDrink, excludeEventOnlyItems, EVENT_CATEGORIES } from './kitchenEventMode.js';

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

test('menu evento: restano tutte le birre e le bevande (decisione Eros 2026-10-14)', () => {
  const items = [
    { id: 'g', category: 'bbq', tags: ['special', 'anniversario'] },
    { id: 'b1', category: 'birre', tags: ['birre-v1'] },
    { id: 'd1', category: 'bevande', tags: ['drink'] },
    { id: 'd2', category: 'bevande' },
    { id: 'c', category: 'cicchetti', tags: ['special'] },
  ];
  assert.deepEqual(filterEventMenuItems(items).map((i) => i.id), ['g', 'b1', 'd1', 'd2']);
  assert.deepEqual(EVENT_CATEGORIES, ['bbq', 'birre', 'bevande']);
  assert.equal(isEventDrink({ category: 'birre' }), true);
  assert.equal(isEventDrink({ category: 'bbq' }), false);
  assert.equal(isEventDrink(null), false);
});

test('modalità spenta: gli item col tag anniversario escono dal menu, gli altri restano identici', () => {
  const items = [
    { id: 'p', category: 'bbq', tags: ['special'] },
    { id: 'g', category: 'bbq', tags: ['special', 'anniversario'] },
    { id: 'x', category: 'birre' },
  ];
  assert.deepEqual(excludeEventOnlyItems(items).map((i) => i.id), ['p', 'x']);
  assert.deepEqual(excludeEventOnlyItems(undefined), []);
});
