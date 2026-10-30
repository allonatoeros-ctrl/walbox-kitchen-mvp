// 20261030130000_drop_non_kitchen_v1.test.js — cancellazione aree non-Kitchen.
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20261030130000_drop_non_kitchen_v1.sql'), 'utf8');
// Solo il codice, senza commenti: i commenti citano apposta le funzioni condivise.
const sql = src.replace(/--.*$/gm, '');

// Righe per tabella nel backup V2 del 2026-10-30 (`ai-ops/current/DB_PULIZIA.md`, Inventario).
const BACKED_UP = {
  fanta_events: 0, fanta_fixtures: 0, fanta_ingestion_runs: 0, fanta_leagues: 1, fanta_lineups: 0,
  fanta_player_snapshots: 117, fanta_rosters: 15, fanta_rounds: 0, fanta_standings: 0,
  fanta_team_members: 1, fanta_team_scores: 0, fanta_teams: 1, fanta_var_adjustments: 0, fanta_votes: 0,
  live_settings: 1, live_submissions: 2, party_ferie_assets: 0, party_ferie_requests: 0,
  playback_state: 1, song_requests: 63, venue_settings: 1,
};
const TABLES = Object.keys(BACKED_UP);
const ROWTYPE_FUNCTIONS = ['party_ferie_attach_asset(uuid, text, text)', 'party_ferie_transition_request(uuid, text)'];
const OTHER_FUNCTIONS = [
  'create_fanta_team_v1(uuid, text)', 'save_fanta_roster_v1(uuid, jsonb)', 'fanta_is_admin()',
  'fn_enforce_lineup_deadline()', 'fn_enforce_max_teams()', 'fn_set_updated_at()',
  'party_ferie_is_operator()',
];

const dropFns = [...sql.matchAll(/drop function([\s\S]*?);/g)].map((m) => ({ body: m[1], at: m.index }));
const dropTable = sql.match(/drop table([\s\S]*?);/);

test('niente CASCADE e niente IF EXISTS: una dipendenza imprevista deve far fallire', () => {
  assert.doesNotMatch(sql, /\bcascade\b/i);
  assert.doesNotMatch(sql, /\bif exists\b/i);
});

test('nessuna tabella kitchen_* e nessuna funzione condivisa nel codice SQL', () => {
  assert.doesNotMatch(sql, /kitchen_/);
  assert.doesNotMatch(sql, /is_staff_for_venue/);
  assert.doesNotMatch(sql, /_walbox_set_updated_at/);
  assert.doesNotMatch(sql, /watchdog_obs/);
});

test('non tocca utenti, schema, Realtime o altri dati', () => {
  assert.doesNotMatch(sql, /\bauth\./);
  assert.doesNotMatch(sql, /\b(delete\s+from|update\s+\w|truncate|insert\s+into)\b/i);
  assert.doesNotMatch(sql, /\bdrop\s+(schema|policy|trigger|type|view|index|sequence)\b/i);
  assert.doesNotMatch(sql, /\balter publication\b/i);
});

test('DROP TABLE unico con esattamente le 21 tabelle non-Kitchen', () => {
  assert.ok(dropTable, 'drop table mancante');
  assert.equal(sql.match(/drop table/g).length, 1);
  for (const t of TABLES) assert.match(dropTable[1], new RegExp(`public\\.${t}\\b`), t);
  assert.equal(dropTable[1].match(/public\./g).length, TABLES.length);
});

test('le 9 funzioni con firma esatta: prima le 2 legate al tipo riga, le altre dopo le tabelle', () => {
  assert.equal(dropFns.length, 2);
  const [before, after] = dropFns;
  assert.ok(before.at < dropTable.index && after.at > dropTable.index, 'ordine dei DROP');
  for (const f of ROWTYPE_FUNCTIONS) assert.ok(before.body.includes(`public.${f}`), f);
  assert.equal(before.body.match(/public\./g).length, ROWTYPE_FUNCTIONS.length);
  for (const f of OTHER_FUNCTIONS) assert.ok(after.body.includes(`public.${f}`), f);
  assert.equal(after.body.match(/public\./g).length, OTHER_FUNCTIONS.length);
});

test('guardia sul backup: prima dei DROP, con i conteggi esatti del 2026-10-30', () => {
  const guard = sql.match(/do \$\$([\s\S]*?)\$\$;/);
  assert.ok(guard && guard.index < dropFns[0].at, 'guardia mancante o dopo i DROP');
  for (const [t, n] of Object.entries(BACKED_UP)) {
    assert.match(guard[1], new RegExp(`\\('${t}', ${n}\\)`), t);
  }
  assert.match(guard[1], /if n > r\.backed_up then\s+raise exception/);
});

test('header veritiero e ordine dopo il congela', () => {
  assert.match(src, /LOCAL BUILD ONLY — NOT APPLIED TO REMOTE/);
  const files = readdirSync(__dirname).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();
  const i = files.indexOf('20261030130000_drop_non_kitchen_v1.sql');
  assert.equal(files[i - 1], '20261030120000_freeze_non_kitchen_access_v1.sql');
});
