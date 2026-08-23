// 20260818120000_fanta_save_roster_rpc_v1.test.js — contratto RPC save_fanta_roster_v1.
// Stile repo: assert statiche sul sorgente SQL, nessuna connessione DB reale
// (nessun apply remoto/DB reale in questo task, vedi CHECKPOINT/report).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '20260818120000_fanta_save_roster_rpc_v1.sql'), 'utf8');

test('save_fanta_roster_v1 e definita come SECURITY DEFINER con search_path pinnato', () => {
  assert.match(src, /create or replace function save_fanta_roster_v1\(/);
  assert.match(src, /security definer/);
  assert.match(src, /set search_path = public/);
});

test('save_fanta_roster_v1 non accetta un user_id come input: usa sempre auth\\.uid\\(\\)', () => {
  const fnStart = src.indexOf('create or replace function save_fanta_roster_v1');
  const fnEnd = src.indexOf('$$;', fnStart);
  const fn = src.slice(fnStart, fnEnd);
  assert.match(fn, /auth\.uid\(\)/);
  assert.doesNotMatch(fn, /p_user_id|p_owner_id/);
});

test('save_fanta_roster_v1 verifica ownership del team (fanta_team_members) o fanta_is_admin()', () => {
  const fnStart = src.indexOf('create or replace function save_fanta_roster_v1');
  const fnEnd = src.indexOf('$$;', fnStart);
  const fn = src.slice(fnStart, fnEnd);
  assert.match(fn, /fanta_team_members/);
  assert.match(fn, /fanta_is_admin\(\)/);
  assert.match(fn, /FANTA_TEAM_NOT_OWNED/);
});

test('save_fanta_roster_v1 fa delete+insert nella stessa funzione (replace atomico, no chiamate client separate)', () => {
  const fnStart = src.indexOf('create or replace function save_fanta_roster_v1');
  const fnEnd = src.indexOf('$$;', fnStart);
  const fn = src.slice(fnStart, fnEnd);
  assert.match(fn, /delete from fanta_rosters where team_id = p_team_id/);
  assert.match(fn, /insert into fanta_rosters/);
});

test('save_fanta_roster_v1 rilancia eccezioni tipizzate (FK/duplicati) invece di fallire silenziosamente', () => {
  assert.match(src, /when foreign_key_violation then/);
  assert.match(src, /FANTA_PLAYER_NOT_FOUND/);
  assert.match(src, /when unique_violation then/);
  assert.match(src, /FANTA_ROSTER_DUPLICATE/);
});

test('save_fanta_roster_v1 e revocata da public e concessa solo ad authenticated (come create_fanta_team_v1)', () => {
  assert.match(src, /revoke all on function save_fanta_roster_v1\(uuid, uuid\[\]\) from public;/);
  assert.match(src, /grant execute on function save_fanta_roster_v1\(uuid, uuid\[\]\) to authenticated;/);
});

test('migration marcata come locale, non applicata a nessun progetto remoto', () => {
  assert.match(src, /Local-only migration draft\. NOT applied to any remote project\./);
});

console.log('20260818120000_fanta_save_roster_rpc_v1.test.js: tutti i test passati.');
