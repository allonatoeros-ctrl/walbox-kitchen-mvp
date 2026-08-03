import { supabase } from './supabaseClient'

// FantaWalrus Auth — layer 1 (login/logout email+password).
// Separato da supabaseAuth.js (Staff/Kitchen): nessuna dipendenza incrociata,
// nessuna chiamata a getStaffSession/isKitchenStaff.
//
// TODO(decisione prodotto): nessun signup qui per scelta (fuori scope brief).
// Ruoli Fanta (manager vs. altri) e provisioning account non ancora definiti:
// da decidere prima di aggiungere signup o permessi differenziati.

export async function signInWithEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

// Una sessione anonima (usata da Jukebox per le richieste brano) non conta
// come login Fanta valido: stesso criterio di getStaffSession in supabaseAuth.js,
// duplicato qui deliberatamente per tenere i due moduli indipendenti.
export async function getFantaSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session || session.user.is_anonymous) return null
  return session
}

export function onFantaAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(!session || session.user.is_anonymous ? null : session)
  })
}
