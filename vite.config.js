import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// P0 SAFETY: complemento del guard DEV in src/lib/supabaseClient.js. Blocca anche
// `vite build` / `vite preview` fuori da Vercel se VITE_SUPABASE_URL punta a production.
const PRODUCTION_SUPABASE_REF = 'pcrqfdzipotprqtuemso'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const supabaseUrl = loadEnv(mode, process.cwd(), '').VITE_SUPABASE_URL || ''
  if (!process.env.VERCEL && supabaseUrl.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error(
      'DEV_PRODUCTION_SUPABASE_BLOCKED: VITE_SUPABASE_URL punta al progetto Supabase di produzione ' +
        `(${PRODUCTION_SUPABASE_REF}) fuori da Vercel. Rimuovilo da .env.local / dall'ambiente della shell.`
    )
  }
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5174,
      allowedHosts: ['localhost', '127.0.0.1', '.trycloudflare.com', 'trycloudflare.com'],
    },
  }
})
