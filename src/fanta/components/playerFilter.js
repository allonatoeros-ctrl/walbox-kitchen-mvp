/*
 * Logica pura di ricerca e filtro del PlayerPicker (fase F2).
 *
 * Vive in un modulo .js separato dal componente perché sia testabile con
 * `node --test`, che non sa leggere JSX. Nessun accesso a React/DOM.
 */

export const ROLE_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

/** Conta i giocatori per ruolo. */
export function countByRole(players) {
  const counts = {};
  for (const p of players) counts[p.role] = (counts[p.role] || 0) + 1;
  return counts;
}

/** Rimuove diacritici (es. "Vlahović" -> "vlahovic") per confronti insensibili agli accenti. */
function normalizeText(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Filtra per ruolo e per testo libero (nome o club, case-insensitive e
 * insensibile ai diacritici: "joao" trova "João", "martinez" trova "Martínez").
 * Query vuota o solo spazi = nessun filtro testuale.
 */
export function filterPlayers(players, { query = '', role = null } = {}) {
  const q = normalizeText(query.trim());
  return players.filter((p) => {
    if (role && p.role !== role) return false;
    if (!q) return true;
    return (
      normalizeText(p.name || '').includes(q) ||
      normalizeText(p.club || '').includes(q)
    );
  });
}
