#!/usr/bin/env bash
# Passo 3A: prova dei PERMESSI REALI su uno stack Supabase LOCALE (non solo Postgres nudo).
# Come scripts/e2e-real-supabase-local.sh: workdir temporanea con copia delle migration e di un config.toml
# patchato (project_id e porte spostate 55xxx per non toccare altri stack locali gia' accesi, seed disabilitato);
# supabase/config.toml del repo NON viene modificato. Mai link / db push / functions deploy / progetti remoti.
# Verifica: (a) via psql sul DB locale con SET ROLE anon / authenticated / service_role: EXECUTE e privilegi di
# tabella + tentativi reali; (b) via PostgREST locale con node fetch: chiave anon, JWT authenticated (firmato col
# segreto JWT LOCALE dello stack) e chiave service_role su /rest/v1/rpc/<rpc> e /rest/v1/<tabella>.
# Alla fine lo stack viene fermato (`supabase stop --no-backup` nella workdir). La workdir temporanea NON viene
# cancellata (regola del progetto: niente rm); sta sotto la cartella temporanea di mktemp.
# Uso: tests/db/food-club/p3_grants_supabase_local.sh      (KEEP_STACK=1 per non fermare lo stack)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORK="${P3_WORK:-$(mktemp -d)}"
PID="walbox-fc-p3-grants"
SB=(npx supabase)
command -v supabase >/dev/null 2>&1 && SB=(supabase)
STARTED=0
cleanup() { if [ "${KEEP_STACK:-0}" != "1" ] && [ "$STARTED" = 1 ]; then (cd "$WORK" && "${SB[@]}" stop --no-backup >/dev/null 2>&1 || true); fi; echo "(workdir lasciata in $WORK)"; }
trap cleanup EXIT

mkdir -p "$WORK/supabase"
cp -R "$ROOT/supabase/migrations" "$WORK/supabase/migrations"
sed -e "s/^project_id = .*/project_id = \"$PID\"/" \
    -e 's/^port = 54321/port = 55321/' -e 's/^port = 54322/port = 55322/' -e 's/^shadow_port = 54320/shadow_port = 55320/' \
    -e 's/^port = 54323/port = 55323/' -e 's/^port = 54324/port = 55324/' -e 's/^port = 54327/port = 55327/' -e 's/^port = 54329/port = 55329/' \
    -e '/^\[db.seed\]/,/^\[/ s/^enabled = true/enabled = false/' \
    "$ROOT/supabase/config.toml" > "$WORK/supabase/config.toml"
grep -q "^project_id = \"$PID\"" "$WORK/supabase/config.toml" && grep -q '^port = 55321' "$WORK/supabase/config.toml" || { echo "BLOCKED: patch config fallita"; exit 2; }

cd "$WORK"
echo "== avvio stack locale ($PID, porte 55xxx) =="
if ! "${SB[@]}" start -x studio,imgproxy,vector,logflare,mailpit,edge-runtime 2>&1 | tail -15; then echo "BLOCKED: stack non avviato"; STARTED=1; exit 2; fi
STARTED=1
eval "$("${SB[@]}" status -o env | grep -E '^(API_URL|DB_URL|ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET)=')"
[ -n "${API_URL:-}" ] && [ -n "${DB_URL:-}" ] || { echo "BLOCKED: status senza URL"; exit 2; }
case "$API_URL" in http://127.0.0.1:55321*) ;; *) echo "BLOCKED: API_URL inatteso ($API_URL)"; exit 2;; esac
fail=0
P() { psql "$DB_URL" -qAtX -v ON_ERROR_STOP=0 "$@"; }

echo "== (0) migration applicate sullo stack =="
P -c "select count(*) || ' migration nel ledger, ultima ' || max(version) from supabase_migrations.schema_migrations"
P -c "select 'oggetti Passo 3A: ' || (select count(*) from pg_proc where proname in ('food_club_seal_order_for_release','food_club_record_checkout_intent','food_club_record_checkout_evidence','food_club_release_voucher_after_evidence')) || ' RPC, ' || (select count(*) from pg_class where relname in ('food_club_release_seals','food_club_checkout_intents','food_club_checkout_evidence')) || ' tabelle'"

echo "== (a) psql: matrice EXECUTE (ruolo -> funzione: t/f; atteso: solo service_role sulle 4 RPC) =="
OUT_A=$(P <<'SQL'
WITH f(sig, role_ok) AS (VALUES
  ('public.food_club_seal_order_for_release(text)', 'service_role'),
  ('public.food_club_record_checkout_intent(uuid)', 'service_role'),
  ('public.food_club_record_checkout_evidence(uuid,text,jsonb)', 'service_role'),
  ('public.food_club_release_voucher_after_evidence(text)', 'service_role'),
  ('public.food_club_release_verified_rules()', NULL),
  ('public.food_club_expected_merchant_code()', NULL),
  ('public.food_club_evidence_normalize(jsonb)', NULL),
  ('public.food_club_release_eval_attempt(public.kitchen_payments,timestamptz)', NULL),
  ('public.food_club_release_seals_guard()', NULL),
  ('public.food_club_release_append_only_guard()', NULL),
  ('public.food_club_seal_guard_insert()', NULL),
  ('public.food_club_seal_guard_claim()', NULL),
  ('public.food_club_retention_sweep()', 'service_role')),
r(role) AS (VALUES ('anon'), ('authenticated'), ('service_role'))
SELECT r.role || ' -> ' || f.sig || ' = ' || has_function_privilege(r.role, f.sig, 'EXECUTE')::text
       || CASE WHEN has_function_privilege(r.role, f.sig, 'EXECUTE') = COALESCE(f.role_ok = r.role, false) THEN ''
               WHEN f.role_ok IS NULL AND r.role = 'service_role' AND f.sig ~ '(verified_rules|merchant_code)' THEN '  [nota: costante di sola lettura, EXECUTE di default a service_role]'
               ELSE '  MISMATCH' END
  FROM f CROSS JOIN r ORDER BY f.sig, r.role;
SQL
)
echo "$OUT_A"
if echo "$OUT_A" | grep -q MISMATCH; then fail=1; echo "MISMATCH nella matrice EXECUTE"; fi

echo "== (a) psql: privilegi tabella/sequenza (atteso: anon/authenticated nulla; service_role solo SELECT) =="
P <<'SQL'
SELECT r.role || ' ' || t.rel || ' ' || string_agg(p.priv || '=' || has_table_privilege(r.role, t.rel, p.priv)::text, ' ' ORDER BY p.priv)
  FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(role)
  CROSS JOIN (VALUES ('public.food_club_release_seals'), ('public.food_club_checkout_intents'), ('public.food_club_checkout_evidence')) t(rel)
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
 GROUP BY r.role, t.rel ORDER BY t.rel, r.role;
SELECT r.role || ' sequenza USAGE=' || has_sequence_privilege(r.role, 'public.food_club_checkout_evidence_id_seq', 'USAGE')::text
  FROM (VALUES ('anon'), ('authenticated'), ('service_role')) r(role);
SELECT 'RLS attiva: ' || string_agg(relname || '=' || relrowsecurity::text, ', ') FROM pg_class WHERE relname IN ('food_club_release_seals','food_club_checkout_intents','food_club_checkout_evidence');
SELECT 'policy sulle tabelle nuove: ' || count(*) FROM pg_policies WHERE tablename IN ('food_club_release_seals','food_club_checkout_intents','food_club_checkout_evidence');
SQL

echo "== (a) psql: tentativi REALI con SET ROLE =="
P <<'SQL' 2>&1 | sed -E 's/^(psql:[^ ]+ )//'
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);
\echo '-- anon: RPC e tabelle'
SET ROLE anon;
SELECT public.food_club_seal_order_for_release('x');
SELECT public.food_club_record_checkout_evidence(gen_random_uuid(), 'get', '{}'::jsonb);
SELECT count(*) FROM public.food_club_release_seals;
INSERT INTO public.food_club_release_seals (order_id, voucher_id) VALUES ('x', gen_random_uuid());
RESET ROLE;
\echo '-- authenticated: RPC e tabelle'
SET ROLE authenticated;
SELECT public.food_club_release_voucher_after_evidence('x');
SELECT count(*) FROM public.food_club_checkout_evidence;
RESET ROLE;
\echo '-- service_role: RPC consentita, scrittura diretta no'
SET ROLE service_role;
SELECT public.food_club_seal_order_for_release('ordine-inesistente');
SELECT count(*) AS seals_select_ok FROM public.food_club_release_seals;
INSERT INTO public.food_club_release_seals (order_id, voucher_id) VALUES ('x', gen_random_uuid());
UPDATE public.food_club_checkout_evidence SET sumup_status = 'PAID';
DELETE FROM public.food_club_checkout_intents;
TRUNCATE public.food_club_checkout_evidence;
SELECT public.food_club_evidence_normalize('{}'::jsonb);
SELECT nextval('public.food_club_checkout_evidence_id_seq');
RESET ROLE;
SQL

echo "== (b) PostgREST locale ($API_URL): anon / authenticated / service_role =="
export API_URL ANON_KEY SERVICE_ROLE_KEY JWT_SECRET
node --input-type=module -e '
import { createHmac, randomUUID } from "node:crypto";
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const sign = (payload) => { const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(payload); return `${h}.${p}.${createHmac("sha256", process.env.JWT_SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const now = Math.floor(Date.now() / 1000);
const KEYS = { anon: process.env.ANON_KEY, authenticated: sign({ role: "authenticated", aud: "authenticated", sub: randomUUID(), iss: "supabase-demo", iat: now, exp: now + 600 }), service_role: process.env.SERVICE_ROLE_KEY };
const base = process.env.API_URL;
async function call(role, method, path, body) {
  const r = await fetch(`${base}${path}`, { method, headers: { apikey: process.env.ANON_KEY, Authorization: `Bearer ${KEYS[role]}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let code = ""; try { code = JSON.parse(t).code || ""; } catch {}
  return { status: r.status, code, text: t.slice(0, 110) };
}
const RPCS = [
  ["food_club_seal_order_for_release", { p_order_id: "x" }, true],
  ["food_club_release_voucher_after_evidence", { p_order_id: "x" }, true],
  ["food_club_record_checkout_intent", { p_attempt_id: randomUUID() }, true],
  ["food_club_record_checkout_evidence", { p_attempt_id: randomUUID(), p_kind: "get", p_fields: {} }, true],
  ["food_club_release_verified_rules", {}, "const"],
  ["food_club_expected_merchant_code", {}, "const"],
  ["food_club_evidence_normalize", { p_fields: {} }, false],
  ["food_club_retention_sweep", {}, true],
];
let bad = 0;
const row = (what, role, res, ok) => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${role.padEnd(13)} ${what.padEnd(52)} HTTP ${res.status} ${res.code} ${res.text.replace(/\s+/g, " ").slice(0, 60)}`); };
for (const [fn, args, allowSvc] of RPCS) {
  for (const role of ["anon", "authenticated", "service_role"]) {
    const res = await call(role, "POST", `/rest/v1/rpc/${fn}`, args);
    const mustDeny = role !== "service_role" || allowSvc === false;
    // negato = 401/403 (42501) oppure 404 (funzione non esposta per quel ruolo); consentito = 200 (anche con ok:false) o errore di dominio 400
    const denied = [401, 403, 404].includes(res.status);
    const allowedOk = role === "service_role" && allowSvc !== false && !denied;
    row(`rpc/${fn}`, role, res, mustDeny ? denied : allowedOk);
  }
}
for (const table of ["food_club_release_seals", "food_club_checkout_intents", "food_club_checkout_evidence"]) {
  for (const role of ["anon", "authenticated"]) {
    for (const [m, q, b] of [["GET", `?select=*&limit=1`], ["POST", ``, { order_id: "x" }], ["PATCH", `?order_id=eq.x`, { order_id: "y" }], ["DELETE", `?order_id=eq.x`]]) {
      const res = await call(role, m, `/rest/v1/${table}${q}`, b);
      row(`${m} ${table}`, role, res, [401, 403, 404].includes(res.status));
    }
  }
  const sel = await call("service_role", "GET", `/rest/v1/${table}?select=*&limit=1`);
  row(`GET ${table}`, "service_role", sel, sel.status === 200);
  for (const [m, q, b] of [["POST", ``, { order_id: "x" }], ["PATCH", `?order_id=eq.x`, { order_id: "y" }], ["DELETE", `?order_id=eq.x`]]) {
    const res = await call("service_role", m, `/rest/v1/${table}${q}`, b);
    row(`${m} ${table}`, "service_role", res, [401, 403, 404].includes(res.status));
  }
}
console.log(bad === 0 ? "POSTGREST: OK" : `POSTGREST: ${bad} esiti fuori atteso`);
process.exit(bad === 0 ? 0 : 1);
' || fail=1
[ $fail -eq 0 ] && echo "P3-GRANTS: OK (leggere anche le sezioni (a) a occhio)" || echo "P3-GRANTS: FAIL"
exit $fail
