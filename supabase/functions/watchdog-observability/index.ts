// supabase/functions/watchdog-observability/index.ts — PROTOTIPO LOCALE, MAI DEPLOYATA (gate di Eros).
// Deploy previsto: `npx supabase functions deploy watchdog-observability --no-verify-jwt` (l'autenticazione è la firma
// HMAC del Watchdog, verificata in handler.ts; nessun JWT viene richiesto né accettato al posto della firma).
//
// Secret della funzione (mai nel repo):
// - WATCHDOG_INSTALLATION_ID — es. "walrus-melegnano": l'unica installazione servita da questo progetto;
// - WATCHDOG_OBS_KEYS        — JSON [{ "kid", "installation_id", "secret" (base64url ≥ 32 byte), "status", "expires_at"? }];
// - SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — iniettate dalla piattaforma in ogni Edge Function.
// Rotazione e revoca: walbox-observability/edge-functions/README.md.
import { createHandler } from './handler.ts';

const handler = createHandler({
  env: (name) => Deno.env.get(name),
  fetch: (input, init) => fetch(input, init),
  now: () => Date.now(),
  log: (line) => console.log(JSON.stringify(line)),
});

Deno.serve(handler);
