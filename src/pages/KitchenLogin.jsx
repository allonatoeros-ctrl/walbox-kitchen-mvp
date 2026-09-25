import { useState } from 'react'
import { signInWithEmail } from '../lib/supabaseAuth'

function navigate(path) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

// Ritorna alla pagina Kitchen da cui arriva il redirect (?next=/kitchen/...), es. /kitchen/prep.
// Allowlist esplicita (mai un percorso qualsiasi dalla query string) per non aprire un open
// redirect: solo destinazioni Kitchen note tornano al posto del default /kitchen/solo.
const ALLOWED_NEXT_PATHS = ['/kitchen/prep', '/kitchen/solo', '/kitchen/cassa']

function resolveNextPath() {
  try {
    const next = new URLSearchParams(window.location.search).get('next')
    return ALLOWED_NEXT_PATHS.includes(next) ? next : '/kitchen/solo'
  } catch {
    return '/kitchen/solo'
  }
}

export default function KitchenLogin() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: authError } = await signInWithEmail(email, password)
    setLoading(false)
    if (authError) { setError(authError.message); return }
    navigate(resolveNextPath())
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0a', fontFamily: 'monospace',
    }}>
      <div style={{
        background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12,
        padding: '40px 36px', width: '100%', maxWidth: 360,
      }}>
        <div style={{ color: '#ff6b00', fontWeight: 700, fontSize: 13, letterSpacing: 3, marginBottom: 6 }}>
          WALBOX KITCHEN
        </div>
        <div style={{ color: '#888', fontSize: 12, marginBottom: 32 }}>Staff — Accesso riservato</div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            id="kitchen-login-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoComplete="email"
            style={inputStyle}
          />
          <input
            id="kitchen-login-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoComplete="current-password"
            style={inputStyle}
          />
          {error && (
            <div style={{ color: '#ff4444', fontSize: 12, padding: '8px 12px', background: 'rgba(255,68,68,0.08)', borderRadius: 6 }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8, padding: '12px', background: loading ? '#2a2a2a' : '#ff6b00',
              color: loading ? '#666' : '#000', border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: 13, letterSpacing: 1, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Accesso...' : 'ACCEDI'}
          </button>
        </form>
      </div>
    </div>
  )
}

const inputStyle = {
  background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: 8,
  padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none', width: '100%',
  boxSizing: 'border-box',
}
