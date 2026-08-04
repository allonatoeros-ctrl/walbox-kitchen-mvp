import { supabase } from './supabaseClient'
import { getFantaSession } from './fantaAuth'

// fantaTeamCreation.js — ponte tra FantaEntryTesseramento e la RPC Supabase
// create_fanta_team_v1() (supabase/migrations/0002_fanta_functions_v1.sql).
// Nessuna logica di roster/lineup/scoring qui: solo sessione -> lega attiva ->
// RPC -> team UUID. Il client non passa mai un identificatore utente: la RPC
// lo ricava da auth.uid() (security definer), coerente col commento della migration.

function extractErrorCode(message) {
  if (typeof message !== 'string') return null
  const match = message.match(/^([A-Z_]+):/)
  return match ? match[1] : null
}

export async function findActiveFantaLeague() {
  const { data, error } = await supabase
    .from('fanta_leagues')
    .select('id')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (error) {
    return { league: null, error: { code: null, message: error.message } }
  }
  if (!data) {
    return {
      league: null,
      error: { code: 'FANTA_LEAGUE_NOT_FOUND', message: 'Nessuna lega attiva trovata' },
    }
  }
  return { league: data, error: null }
}

// Orchestratore unico usato da FantaEntryTesseramento al submit.
export async function createFantaTeam(teamName) {
  const session = await getFantaSession()
  if (!session) {
    return { teamId: null, error: { code: 'FANTA_AUTH_REQUIRED', message: 'Sessione non valida' } }
  }

  const { league, error: leagueError } = await findActiveFantaLeague()
  if (leagueError) {
    return { teamId: null, error: leagueError }
  }

  const { data, error } = await supabase.rpc('create_fanta_team_v1', {
    p_league_id: league.id,
    p_team_name: teamName,
  })

  if (error) {
    return { teamId: null, error: { code: extractErrorCode(error.message), message: error.message } }
  }

  return { teamId: data, error: null }
}
