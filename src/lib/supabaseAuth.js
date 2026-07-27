import { supabase } from './supabaseClient'

export async function signInWithEmail(email, password) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getStaffSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session || session.user.is_anonymous) return null
  return session
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(!session || session.user.is_anonymous ? null : session)
  })
}

// F-SEC-2: verifica autorizzazione staff per venue via funzione DB esistente is_staff_for_venue.
// Nessuna modifica DB/RLS: chiama solo la SECURITY DEFINER gia' presente.
// NOTA: il check client e' UX; l'autorita' resta la policy DB (kitchen_orders usa is_staff_for_venue).
export async function isKitchenStaff(venueId = 'walrus-main') {
  const { data, error } = await supabase.rpc('is_staff_for_venue', { p_venue_id: venueId })
  if (error) return false
  return !!data
}
