import { supabase } from './supabaseClient.js'
import { resolveSnapshotUUID } from '../fanta/adapters/playerSnapshotAdapter.js'

/**
 * fantaRosterPersistence.js — Fase 1 persistenza roster FantaWalrus.
 *
 * Salva/rimuove i giocatori della squadra su fanta_rosters.
 * Ogni id frontend e' in formato p_<rawId>; viene risolto in UUID
 * tramite resolveSnapshotUUID() -> fanta_player_snapshots.id.
 *
 * localStorage NON viene toccato da questo helper: resta competenza
 * dei chiamanti (FantaTeamBuilder/FantaHome).
 */

export async function saveRosterV1(teamId, roster) {
  if (!Array.isArray(roster)) {
    return { ok: false, saved: 0, error: 'ROSTER_INVALIDO: roster deve essere un array' }
  }

  const validItems = []
  for (const item of roster) {
    if (!item || typeof item.id !== 'string') continue
    const { snapshotId, error } = await resolveSnapshotUUID(supabase, item.id)
    if (error || !snapshotId) {
      return { ok: false, saved: 0, error: error || 'UUID_MANCANTE' }
    }
    validItems.push({ playerId: snapshotId, isStarter: Boolean(item.isStarter) })
  }

  const playerIds = validItems.map((i) => i.playerId)

  const { error: delError } = await supabase
    .from('fanta_rosters')
    .delete()
    .eq('team_id', teamId)

  if (delError) {
    return { ok: false, saved: 0, error: delError.message }
  }

  if (playerIds.length > 0) {
    const rows = playerIds.map((playerId) => ({
      team_id: teamId,
      player_id: playerId,
    }))

    const { error: insError } = await supabase.from('fanta_rosters').insert(rows)

    if (insError) {
      return { ok: false, saved: 0, error: insError.message }
    }
  }

  return { ok: true, saved: validItems.length }
}
