import { createClient } from '@supabase/supabase-js'

// P0 SAFETY: ref del progetto Supabase di produzione. Se questo ref compare in
// VITE_SUPABASE_URL mentre gira una build di sviluppo (import.meta.env.DEV),
// l'app deve bloccarsi prima di qualunque richiesta a Supabase, non solo loggare.
const PRODUCTION_SUPABASE_REF = 'pcrqfdzipotprqtuemso'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (import.meta.env.DEV && supabaseUrl && supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
  throw new Error(
    'DEV_PRODUCTION_SUPABASE_BLOCKED: VITE_SUPABASE_URL punta al progetto Supabase di ' +
      `produzione (${PRODUCTION_SUPABASE_REF}) in modalita' sviluppo (import.meta.env.DEV=true). ` +
      'Rimuovi il ref di produzione da .env.local e configura un backend Supabase dedicato allo sviluppo.'
  )
}

const isConfigured = Boolean(supabaseUrl && supabaseAnonKey)

if (!isConfigured) {
  console.warn(
    '[supabaseClient] VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY mancanti: client Supabase disabilitato.'
  )
}

// Import statico usato da più pagine (anche non-auth): niente createClient()
// eager con url/key undefined, altrimenti crasha al caricamento del bundle
// prima ancora che la route venga risolta. Se non configurato, l'errore
// si sposta al primo uso reale (supabase.auth.*, supabase.from...), invariato
// per i path autenticati con env presenti.
export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : new Proxy(
      {},
      {
        get() {
          throw new Error(
            'Supabase non configurato: VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY mancanti.'
          )
        },
      }
    )
