// kitchenPrice.test.js — Fase 3.1 del restyling menu cliente (2026-10-25).
//
// Copre il formato prezzo unico del menu cliente (src/lib/kitchenPrice.js), che sostituisce
// le 10 copie locali di `formatPrice` nelle section.
//
// Eseguire a mano: node --test src/lib/kitchenPrice.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatPrice } from './kitchenPrice.js';

const NBSP = '\u00A0';

test('interi senza decimali, euro dopo il numero', () => {
  assert.equal(formatPrice(8), `8${NBSP}€`);
  assert.equal(formatPrice(19), `19${NBSP}€`);
  assert.equal(formatPrice(0), `0${NBSP}€`);
});

test('non interi con due decimali e la virgola', () => {
  assert.equal(formatPrice(13.9), `13,90${NBSP}€`);
  assert.equal(formatPrice(5.5), `5,50${NBSP}€`);
  assert.equal(formatPrice(4.25), `4,25${NBSP}€`);
});

test('forceDecimals mostra i decimali anche sugli interi (Pesi Massimi)', () => {
  assert.equal(formatPrice(19, true), `19,00${NBSP}€`);
  assert.equal(formatPrice(13.9, true), `13,90${NBSP}€`);
});

test('errori di virgola mobile arrotondati al centesimo', () => {
  assert.equal(formatPrice(0.1 + 0.2), `0,30${NBSP}€`);
  assert.equal(formatPrice(7.999999), `8${NBSP}€`);
  assert.equal(formatPrice(16.004), `16${NBSP}€`);
});

test('stringhe numeriche (es. numeric da Postgres) accettate', () => {
  assert.equal(formatPrice('8'), `8${NBSP}€`);
  assert.equal(formatPrice('13.90'), `13,90${NBSP}€`);
});

test('prezzo mancante o non valido → stringa vuota (il chiamante mostra PREZZO IN ARRIVO)', () => {
  assert.equal(formatPrice(null), '');
  assert.equal(formatPrice(undefined), '');
  assert.equal(formatPrice(''), '');
  assert.equal(formatPrice(NaN), '');
  assert.equal(formatPrice('abc'), '');
  assert.equal(formatPrice(Infinity), '');
});
