// playerSnapshotAdapter.js — mapping player id frontend (p_<rawId>) -> fanta_player_snapshots.id (uuid).
// Solo lettura: nessuna scrittura, nessuna service role, nessuna chiamata esterna oltre Supabase client
// già inizializzato dal chiamante. Vedi supabaseSchemaContractV1.js per il contratto lineup/roster e
// supabase/migrations/0001_fanta_schema_v1.sql per fanta_player_snapshots (unique external_player_id+snapshot_version).

const FRONTEND_ID_PATTERN = /^p_([A-Za-z0-9]+)$/;

/**
 * Valida il formato p_<rawId> e restituisce external_player_id (rawId, senza prefisso "p_").
 * @param {string} frontendId es. "p_001", "p_26644"
 * @returns {string} external_player_id
 * @throws {Error} ID_INVALIDO se il formato non combacia
 */
export function normalizzaId(frontendId) {
  if (typeof frontendId !== "string") {
    throw new Error(`ID_INVALIDO: atteso string, ricevuto ${typeof frontendId}`);
  }
  const match = FRONTEND_ID_PATTERN.exec(frontendId);
  if (!match) {
    throw new Error(`ID_INVALIDO: "${frontendId}" non rispetta il formato p_<rawId>`);
  }
  return match[1];
}

/**
 * Risolve l'UUID fanta_player_snapshots.id a partire da un id frontend (p_<rawId>).
 * Nessuna scrittura, nessuna service role: solo select su fanta_player_snapshots.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} frontendId
 * @returns {Promise<{snapshotId: string|null, error: string|null}>}
 */
export async function resolveSnapshotUUID(supabase, frontendId) {
  let externalPlayerId;
  try {
    externalPlayerId = normalizzaId(frontendId);
  } catch (err) {
    return { snapshotId: null, error: err.message };
  }

  const { data, error } = await supabase
    .from("fanta_player_snapshots")
    .select("id")
    .eq("external_player_id", externalPlayerId)
    .maybeSingle();

  if (error) {
    return { snapshotId: null, error: `SUPABASE_ERROR: ${error.message}` };
  }
  if (!data) {
    return { snapshotId: null, error: `SNAPSHOT_NON_TROVATO: external_player_id "${externalPlayerId}"` };
  }

  return { snapshotId: data.id, error: null };
}
