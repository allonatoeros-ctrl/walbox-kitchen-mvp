import test from 'node:test';
import assert from 'node:assert/strict';
import { filterPlayers, countByRole, ROLE_ORDER } from './playerFilter.js';
import playersData from '../data/players.json' with { type: 'json' };

const SAMPLE = [
  { id: 'a', name: 'Mattia Perin', role: 'GK', club: 'JUV' },
  { id: 'b', name: 'Alessandro Bastoni', role: 'DEF', club: 'INT' },
  { id: 'c', name: 'Nicolò Barella', role: 'MID', club: 'INT' },
  { id: 'd', name: 'Rafael Leão', role: 'FWD', club: 'MIL' },
];

test('filtro: query vuota restituisce tutti', () => {
  assert.equal(filterPlayers(SAMPLE, {}).length, 4);
  assert.equal(filterPlayers(SAMPLE, { query: '   ' }).length, 4);
});

test('ricerca: per nome, case-insensitive e parziale', () => {
  assert.deepEqual(filterPlayers(SAMPLE, { query: 'barella' }).map((p) => p.id), ['c']);
  assert.deepEqual(filterPlayers(SAMPLE, { query: 'PERIN' }).map((p) => p.id), ['a']);
  assert.deepEqual(filterPlayers(SAMPLE, { query: 'ni' }).map((p) => p.id), ['b', 'c']);
});

test('ricerca: per club', () => {
  assert.deepEqual(filterPlayers(SAMPLE, { query: 'int' }).map((p) => p.id), ['b', 'c']);
});

test('ricerca: insensibile ai diacritici, query ASCII trova nomi accentati', () => {
  assert.deepEqual(filterPlayers(SAMPLE, { query: 'leao' }).map((p) => p.id), ['d']);
  assert.deepEqual(filterPlayers(SAMPLE, { query: 'nicolo' }).map((p) => p.id), ['c']);
});

test('ricerca: query accentata trova comunque il nome (nessuna regressione)', () => {
  assert.deepEqual(filterPlayers(SAMPLE, { query: 'Leão' }).map((p) => p.id), ['d']);
  assert.deepEqual(filterPlayers(SAMPLE, { query: 'Nicolò' }).map((p) => p.id), ['c']);
});

test('ricerca: diacritici diversi non producono falsi positivi', () => {
  const withMartinez = [...SAMPLE, { id: 'e', name: 'Lautaro Martínez', role: 'FWD', club: 'INT' }];
  assert.deepEqual(filterPlayers(withMartinez, { query: 'martinez' }).map((p) => p.id), ['e']);
  assert.deepEqual(filterPlayers(withMartinez, { query: 'joao' }).map((p) => p.id), []);
});

test('ricerca: nessun risultato restituisce lista vuota, non null', () => {
  const r = filterPlayers(SAMPLE, { query: 'zzzz' });
  assert.ok(Array.isArray(r));
  assert.equal(r.length, 0);
});

test('filtro ruolo: isola il reparto', () => {
  assert.deepEqual(filterPlayers(SAMPLE, { role: 'DEF' }).map((p) => p.id), ['b']);
  assert.equal(filterPlayers(SAMPLE, { role: 'GK' }).length, 1);
});

test('ricerca + ruolo si combinano in AND', () => {
  assert.deepEqual(filterPlayers(SAMPLE, { query: 'int', role: 'MID' }).map((p) => p.id), ['c']);
  assert.equal(filterPlayers(SAMPLE, { query: 'int', role: 'FWD' }).length, 0);
});

test('filtro non muta la lista in ingresso', () => {
  const copy = SAMPLE.map((p) => ({ ...p }));
  filterPlayers(SAMPLE, { query: 'ni', role: 'MID' });
  assert.deepEqual(SAMPLE, copy);
});

test('countByRole conta per reparto', () => {
  assert.deepEqual(countByRole(SAMPLE), { GK: 1, DEF: 1, MID: 1, FWD: 1 });
  assert.deepEqual(countByRole([]), {});
});

test('countByRole sul dataset reale copre i 4 reparti noti', () => {
  const counts = countByRole(playersData);
  for (const role of ROLE_ORDER) {
    assert.ok(counts[role] > 0, `reparto ${role} vuoto`);
  }
  const total = ROLE_ORDER.reduce((s, r) => s + counts[r], 0);
  assert.equal(total, playersData.length, 'ogni giocatore ha un ruolo noto');
});

test('ricerca sul dataset reale: club esistente restituisce solo quel club', () => {
  const res = filterPlayers(playersData, { query: 'JUV' });
  assert.ok(res.length > 0);
  assert.ok(res.every((p) => p.club === 'JUV' || p.name.toLowerCase().includes('juv')));
});

// --- Regole di indisponibilità replicate dal Team Builder -------------------
// Guardia di regressione: i limiti mostrati dal picker devono restare quelli
// di scoreEngine.js (ROLE_LIMITS / MAX_PER_CLUB), non divergere.
const ROLE_LIMITS = { GK: 1, DEF: 5, MID: 5, FWD: 5 };
const MAX_PER_CLUB = 3;
const MAX_STARTERS = 11;

function starterUnavailableReason(p, { counts, selectedCount }) {
  if ((counts.clubs[p.club] || 0) >= MAX_PER_CLUB) return `MAX ${MAX_PER_CLUB} ${p.club}`;
  if (counts.role[p.role] >= ROLE_LIMITS[p.role]) return `${p.role} AL LIMITE`;
  if (selectedCount >= MAX_STARTERS) return 'ROSA PIENA';
  return null;
}

test('indisponibilità: terzo giocatore dello stesso club blocca il quarto', () => {
  const counts = { role: { GK: 0, DEF: 2, MID: 0, FWD: 0 }, clubs: { INT: 3 } };
  const r = starterUnavailableReason({ role: 'DEF', club: 'INT' }, { counts, selectedCount: 3 });
  assert.equal(r, 'MAX 3 INT');
});

test('indisponibilità: secondo portiere bloccato', () => {
  const counts = { role: { GK: 1, DEF: 0, MID: 0, FWD: 0 }, clubs: {} };
  assert.equal(
    starterUnavailableReason({ role: 'GK', club: 'MIL' }, { counts, selectedCount: 1 }),
    'GK AL LIMITE'
  );
});

test('indisponibilità: rosa piena a 11', () => {
  const counts = { role: { GK: 1, DEF: 4, MID: 3, FWD: 3 }, clubs: {} };
  assert.equal(
    starterUnavailableReason({ role: 'FWD', club: 'NAP' }, { counts, selectedCount: 11 }),
    'ROSA PIENA'
  );
});

test('indisponibilità: giocatore ammesso quando nessun limite è raggiunto', () => {
  const counts = { role: { GK: 1, DEF: 2, MID: 1, FWD: 1 }, clubs: { NAP: 1 } };
  assert.equal(
    starterUnavailableReason({ role: 'FWD', club: 'NAP' }, { counts, selectedCount: 5 }),
    null
  );
});
