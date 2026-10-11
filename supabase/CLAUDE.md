# supabase/ — regole per migration, funzioni e DB

Area protetta (`CLAUDE.md §5`). Il DB di produzione è `pcrqfdzipotprqtuemso`: schema, RLS, grant e Vault
servono il locale in servizio. Procedura completa di una migration: skill **`walbox-supabase-migration`**.

## Cosa c'è

- `migrations/`: migration SQL `YYYYMMDDHHMMSS_<nome>.sql`, quasi sempre con un `.test.js` gemello.
  Contengono anche tabelle di altri moduli (`fanta_*`, Jukebox): non toccarle da un task Kitchen.
- `functions/send-order-ready-push/`: edge function Deno (web-push), chiamata dal trigger SQL "ordine pronto"
  con un secret in Vault.
- `config.toml`: per lo stack locale. `project_id` e i seed (`seed.sql` mancante, `seed/` solo Fanta) sono
  residui di altri moduli: non affidarsi a `db reset` con seed per test Kitchen.

## Regole invarianti

1. **Apply solo con `npx supabase db push --linked`**, sempre gate di Eros. Mai `apply_migration` (MCP),
   mai `db query -f`, mai SQL mutativo dal MCP. Motivo e procedura anti-drift: `ai-ops/SECURITY_POLICY.md §5.1`.
2. **Prima e dopo l'apply:** `npx supabase migration list --linked` → zero pending, zero remote-only.
3. **Il filename è la version.** Non rinominare una migration già applicata; non modificare il SQL di una
   migration già applicata: si scrive una migration nuova.
4. **Header veritiero:** ogni migration dichiara se è locale o applicata. Se il remoto cambia, si corregge
   l'header nello stesso task (solo commenti).
5. **Compatibilità con il frontend in produzione:** una migration può andare in produzione prima del deploy del
   codice. Deve essere additiva (superset di stati/colonne, niente DROP di ciò che il codice live usa).
6. **Sicurezza:** ogni nuova tabella `kitchen_*` nasce con RLS attiva; staff via `is_staff_for_venue()`;
   nuove funzioni `SECURITY DEFINER` con `SET search_path` e guardie interne (`auth.uid()`, `service_role_only`).
   Molte funzioni esistenti non fissano `search_path`: debito noto, non correggerlo fuori da un task dedicato.
   `REVOKE` da `anon`/`public` di ciò che il cliente non deve chiamare. Grant ed EXECUTE si verificano in sola
   lettura (`has_function_privilege`).
7. **Edge function:** deploy (`npx supabase functions deploy`) solo con gate di Eros; secret e chiavi VAPID
   mai nel repo.

## Test

- Statici, senza DB: `node --test supabase/migrations/<ts>*.test.js` (assert sul testo SQL).
- Runtime su Postgres locale effimero (Docker/OrbStack): skill `e2e-real-local`
  (`scripts/e2e-real-supabase-local.sh`). Mai contro la produzione.
- Lettura della produzione: solo MCP Supabase di progetto (read-only) o `migration list --linked`.
