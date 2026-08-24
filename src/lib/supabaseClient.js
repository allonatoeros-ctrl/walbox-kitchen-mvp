import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

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
