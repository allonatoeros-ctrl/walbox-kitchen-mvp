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
