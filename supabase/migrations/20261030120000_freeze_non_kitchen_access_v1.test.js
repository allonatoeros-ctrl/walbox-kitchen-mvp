// 20261030120000_freeze_non_kitchen_access_v1.test.js — congelamento aree non-Kitchen.
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20261030120000_freeze_non_kitchen_access_v1.sql'), 'utf8');
const rollback = readFileSync(
  join(__dirname, '..', '..', 'ai-ops', 'current', 'DB_PULIZIA_rollback_congela.sql'),
  'utf8',
);
// Solo il codice, senza commenti: i commenti citano apposta le funzioni condivise.
const sql = src.replace(/--.*$/gm, '');

const TABLES = [
  'fanta_events', 'fanta_fixtures', 'fanta_ingestion_runs', 'fanta_leagues', 'fanta_lineups',
  'fanta_player_snapshots', 'fanta_rosters', 'fanta_rounds', 'fanta_standings',
  'fanta_team_members', 'fanta_team_scores', 'fanta_teams', 'fanta_var_adjustments', 'fanta_votes',
  'live_settings', 'live_submissions', 'party_ferie_assets', 'party_ferie_requests',
  'playback_state', 'song_requests', 'venue_settings',
];
const FUNCTIONS = [
  'create_fanta_team_v1(uuid, text)', 'save_fanta_roster_v1(uuid, jsonb)', 'fanta_is_admin()',
  'fn_enforce_lineup_deadline()', 'fn_enforce_max_teams()', 'fn_set_updated_at()',
  'party_ferie_attach_asset(uuid, text, text)', 'party_ferie_is_operator()',
  'party_ferie_transition_request(uuid, text)',
];
const REALTIME = [
  'song_requests', 'playback_state', 'venue_settings', 'live_settings', 'live_submissions',
  'party_ferie_requests',
];

test('nessun DROP, DELETE, UPDATE o TRUNCATE: si toglie solo l\'accesso', () => {
  // L'unico "drop table" ammesso e' l'uscita dalla publication Realtime.
  assert.doesNotMatch(sql, /(?<!supabase_realtime\s)\bdrop\s+(table|function|policy|trigger|schema)\b/i);
  assert.doesNotMatch(sql, /\b(delete\s+from|update\s+public\.|truncate\s+(table\s+)?public\.)/i);
});

test('nessuna tabella kitchen_* e nessuna funzione condivisa nel codice SQL', () => {
  assert.doesNotMatch(sql, /kitchen_/);
  assert.doesNotMatch(sql, /is_staff_for_venue/);
  assert.doesNotMatch(sql, /_walbox_set_updated_at/);
  assert.doesNotMatch(sql, /watchdog_obs/);
});

test('service_role e postgres non perdono accesso', () => {
  assert.doesNotMatch(sql, /from[^;]*\b(service_role|postgres)\b/i);
});

test('REVOKE ALL da anon e authenticated su tutte le 21 tabelle non-Kitchen', () => {
  const block = sql.match(/revoke all on table([\s\S]*?)from anon, authenticated;/);
  assert.ok(block, 'blocco revoke tabelle mancante');
  for (const t of TABLES) assert.match(block[1], new RegExp(`public\\.${t}\\b`), t);
  assert.equal(block[1].match(/public\./g).length, TABLES.length);
});

test('REVOKE sulla sequence di party_ferie_requests', () => {
  assert.match(sql, /revoke all on sequence public\.party_ferie_requests_queue_position_seq from anon, authenticated;/);
});

test('REVOKE EXECUTE anche da PUBLIC su tutte le 9 funzioni, con firma esatta', () => {
  const block = sql.match(/revoke execute on function([\s\S]*?)from public, anon, authenticated;/);
  assert.ok(block, 'blocco revoke funzioni mancante');
  for (const f of FUNCTIONS) assert.ok(block[1].includes(`public.${f}`), f);
  assert.equal(block[1].match(/public\./g).length, FUNCTIONS.length);
});

test('Realtime: toglie le 6 tabelle in modo idempotente', () => {
  for (const t of REALTIME) assert.match(sql, new RegExp(`'${t}'`), t);
  assert.match(sql, /if exists \(\s*select 1 from pg_publication_tables/);
  assert.match(sql, /alter publication supabase_realtime drop table public\.%I/);
});

test('header veritiero: locale, non applicata', () => {
  assert.match(src, /LOCAL BUILD ONLY — NOT APPLIED TO REMOTE/);
});

test('il rollback ridà accesso a ogni tabella, funzione e tabella Realtime congelata', () => {
  const rb = rollback.replace(/--.*$/gm, '');
  for (const t of TABLES.filter((t) => t !== 'party_ferie_requests')) {
    assert.match(rb, new RegExp(`public\\.${t}\\b`), t);
  }
  for (const f of FUNCTIONS) assert.ok(rb.includes(`public.${f}`), f);
  assert.match(rb, /alter publication supabase_realtime add table/);
  for (const t of REALTIME) assert.match(rb, new RegExp(`public\\.${t}\\b`), t);
  assert.doesNotMatch(rb, /kitchen_|is_staff_for_venue|_walbox_set_updated_at/);
});
