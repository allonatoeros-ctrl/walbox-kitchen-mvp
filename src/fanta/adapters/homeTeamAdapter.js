// homeTeamAdapter.js — motore dati puro per F3 Home squadra
// Input: identityRaw, teamRaw, players
// Output: stato Home normalizzato, nessun I/O oltre ai parametri.

const ROLE_LABELS = { GK: 'POR', DEF: 'DIF', MID: 'CEN', FWD: 'ATT' };

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueById(array) {
  const seen = new Set();
  const out = [];
  for (const item of array) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(item);
  }
  return out;
}

function enrichRoster(rosterItems, playersById) {
  return rosterItems.map((r) => {
    const player = playersById[r.id];
    if (!player) return null;
    return {
      id: player.id,
      name: player.name,
      role: player.role,
      club: player.club,
      isStarter: Boolean(r.isStarter),
    };
  }).filter(Boolean);
}

function countRoles(players) {
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of players) {
    if (p.role in counts) counts[p.role] += 1;
  }
  return counts;
}

function parseIdentity(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const crest = raw.crest && typeof raw.crest === 'object' && raw.crest.preset
    ? {
        id: raw.crest.id || null,
        preset: {
          id: raw.crest.preset.id || null,
          shape: raw.crest.preset.shape || null,
          pattern: raw.crest.preset.pattern || null,
          palette: raw.crest.preset.palette || null,
          name: raw.crest.preset.name || null,
          motto: raw.crest.preset.motto || null,
          territory: raw.crest.preset.territory || null,
        },
      }
    : null;

  const teamColor = raw.teamColor && typeof raw.teamColor === 'object'
    ? {
        id: raw.teamColor.id || null,
        value: raw.teamColor.value || null,
        label: raw.teamColor.label || null,
      }
    : null;

  return {
    teamId: typeof raw.teamId === 'string' ? raw.teamId : null,
    teamName: typeof raw.teamName === 'string' ? raw.teamName : '',
    nickname: typeof raw.managerNickname === 'string' ? raw.managerNickname : '',
    crest,
    teamColor,
  };
}

function parseTeam(raw, identity) {
  if (!raw || typeof raw !== 'object' || !identity?.teamId) return null;
  if (typeof raw.teamId !== 'string' || raw.teamId !== identity.teamId) return null;
  if (typeof raw.formation !== 'string' || !raw.formation) return null;

  const roster = safeArray(raw.roster);
  const starters = roster.filter((r) => Boolean(r.isStarter));
  if (starters.length === 0) return null;

  return {
    teamId: raw.teamId,
    formation: raw.formation,
    roster,
  };
}

/**
 * Costruisce lo stato Home normalizzato.
 *
 * @param {any} identityRaw
 * @param {any} teamRaw
 * @param {Array<{id:string,name:string,role:string,club:string}>} players
 * @returns {object}
 */
export function buildHomeState(identityRaw, teamRaw, players) {
  const identity = parseIdentity(identityRaw);
  if (!identity || !identity.teamId) {
    return {
      status: 'missing_identity',
      identity: null,
      formation: null,
      starters: [],
      bench: [],
      counts: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
      totalPlayers: 0,
      missingIds: [],
    };
  }

  const team = parseTeam(teamRaw, identity);
  if (!team) {
    return {
      status: 'incomplete',
      identity,
      formation: null,
      starters: [],
      bench: [],
      counts: { GK: 0, DEF: 0, MID: 0, FWD: 0 },
      totalPlayers: 0,
      missingIds: [],
    };
  }

  const playersById = {};
  for (const p of safeArray(players)) {
    if (p && typeof p.id === 'string') playersById[p.id] = p;
  }

  const validIds = new Set(Object.keys(playersById));

  const cleanRoster = uniqueById(team.roster);
  const missingIds = cleanRoster.filter((r) => !validIds.has(r.id)).map((r) => r.id);
  const knownRoster = cleanRoster.filter((r) => validIds.has(r.id));

  const startersRaw = knownRoster.filter((r) => Boolean(r.isStarter));
  const benchRaw = knownRoster.filter((r) => !Boolean(r.isStarter));

  const starters = enrichRoster(startersRaw, playersById);
  const bench = enrichRoster(benchRaw, playersById);

  const counts = countRoles([...starters, ...bench]);
  const totalPlayers = starters.length + bench.length;
  const status = starters.length >= 11 ? 'valid' : 'incomplete';

  return {
    status,
    identity,
    formation: team.formation,
    starters,
    bench,
    counts,
    totalPlayers,
    missingIds,
  };
}
