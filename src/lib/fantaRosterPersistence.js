import { supabase } from './supabaseClient.js'
import { resolveSnapshotUUID } from '../fanta/adapters/playerSnapshotAdapter.js'

/**
 * fantaRosterPersistence.js — Fase 1 persistenza roster FantaWalrus.
 *
 * Salva/rimuove i giocatori della squadra su fanta_rosters tramite la RPC
 * atomica save_fanta_roster_v1() (supabase/migrations/
 * 20260818130000_fanta_roster_is_starter_v1.sql): delete+insert avvengono in
 * una singola chiamata DB, con rollback automatico su errore (fix P0,
 * prima erano due chiamate .delete()+.insert() separate e non atomiche).
 * La RPC riceve un payload strutturato (p_roster: [{ player_id, is_starter }])
 * cosi' la distinzione titolare/panchina viene scritta atomicamente insieme
 * a player_id, invece di andare persa (fix schema: fanta_rosters non aveva
 * una colonna is_starter, vedi 20260818130000).
 * Ogni id frontend e' in formato p_<rawId>; viene risolto in UUID
 * tramite resolveSnapshotUUID() -> fanta_player_snapshots.id, lato client,
 * prima di chiamare la RPC (che riceve solo UUID gia' risolti).
 *
 * localStorage NON viene toccato da questo helper: resta competenza
 * dei chiamanti (FantaTeamBuilder/FantaHome).
 */

export async function saveRosterV1(teamId, roster) {
  if (!Array.isArray(roster)) {
    return { ok: false, saved: 0, error: 'ROSTER_INVALIDO: roster deve essere un array' }
  }

  const seenIds = new Set()
  const validItems = []
  for (const item of roster) {
    if (!item || typeof item.id !== 'string') continue
    if (seenIds.has(item.id)) {
      return { ok: false, saved: 0, error: 'ROSTER_DUPLICATO: id giocatore ripetuto nel roster' }
    }
    seenIds.add(item.id)

    const { snapshotId, error } = await resolveSnapshotUUID(supabase, item.id)
    if (error || !snapshotId) {
      return { ok: false, saved: 0, error: error || 'UUID_MANCANTE' }
    }
    validItems.push({ playerId: snapshotId, isStarter: Boolean(item.isStarter) })
  }

  const payload = validItems.map((i) => ({ player_id: i.playerId, is_starter: i.isStarter }))

  const { data, error } = await supabase.rpc('save_fanta_roster_v1', {
    p_team_id: teamId,
    p_roster: payload,
  })

  if (error) {
    return { ok: false, saved: 0, error: error.message }
  }

  return { ok: true, saved: typeof data === 'number' ? data : validItems.length }
}

/**
 * Carica il roster cloud per teamId leggendo fanta_rosters join
 * fanta_player_snapshots. Nessuna scrittura, nessun touch su
 * fanta_lineups. Fallimento/rete -> { ok: false, error }.
 */
export async function loadRosterV1(teamId) {
  if (!teamId || typeof teamId !== 'string') {
    return { ok: false, roster: [], error: 'TEAM_ID_MANCANTE' }
  }

  const { data, error } = await supabase
    .from('fanta_rosters')
    .select('player_id, is_starter, fanta_player_snapshots ( external_player_id )')
    .eq('team_id', teamId)

  if (error) {
    return { ok: false, roster: [], error: `SUPABASE_ERROR: ${error.message}` }
  }

  if (!Array.isArray(data)) {
    return { ok: false, roster: [], error: 'ROSTER_NON_TROVATO' }
  }

  const roster = data
    .map((row) => {
      const ext = row?.fanta_player_snapshots?.external_player_id
      if (!ext || !row.player_id) return null
      return { id: `p_${ext}`, isStarter: Boolean(row.is_starter) }
    })
    .filter(Boolean)

  return { ok: true, roster }
}
