#!/usr/bin/env bash
# Passo 3B: integrazione API reale (create-checkout + sweep di abbandono con fase Food Club) su uno stack Supabase
# LOCALE. Stesso schema di p3_grants_supabase_local.sh: workdir temporanea con copia delle migration e config.toml
# patchato (project_id proprio, porte 55xxx, seed disabilitato); supabase/config.toml del repo NON viene modificato.
# Mai link / db push / functions deploy / progetti remoti. SumUp sempre finto (fetch mockata solo per api.sumup.com;
# qualunque altro host diverso dallo stack locale fa fallire lo scenario).
# Alla fine lo stack viene fermato (`supabase stop --no-backup` nella workdir). La workdir NON viene cancellata
# (regola del progetto: niente rm); sta sotto la cartella temporanea di mktemp.
# Uso: tests/db/food-club/p3b_api_supabase_local.sh      (KEEP_STACK=1 per non fermare lo stack)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
WORK="${P3B_WORK:-$(mktemp -d)}"
PID="walbox-fc-p3b-api"
SB=(npx supabase)
command -v supabase >/dev/null 2>&1 && SB=(supabase)
STARTED=0
cleanup() { if [ "${KEEP_STACK:-0}" != "1" ] && [ "$STARTED" = 1 ]; then (cd "$WORK" && "${SB[@]}" stop --no-backup >/dev/null 2>&1 || true); fi; echo "(workdir lasciata in $WORK)"; }
trap cleanup EXIT

# Preflight: porte libere (nessuno stack altrui viene toccato).
for p in 55320 55321 55322 55323 55324 55327 55329; do
  if lsof -nP -iTCP:$p -sTCP:LISTEN >/dev/null 2>&1; then echo "BLOCKED: porta $p occupata"; exit 2; fi
done

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
if ! "${SB[@]}" start -x studio,imgproxy,vector,logflare,mailpit,edge-runtime,realtime,storage-api 2>&1 | tail -5; then echo "BLOCKED: stack non avviato"; STARTED=1; exit 2; fi
STARTED=1
eval "$("${SB[@]}" status -o env | grep -E '^(API_URL|DB_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
[ -n "${API_URL:-}" ] && [ -n "${DB_URL:-}" ] || { echo "BLOCKED: status senza URL"; exit 2; }
case "$API_URL" in http://127.0.0.1:55321*) ;; *) echo "BLOCKED: API_URL inatteso ($API_URL)"; exit 2;; esac
case "$DB_URL" in postgresql://*@127.0.0.1:55322/*) ;; *) echo "BLOCKED: DB_URL inatteso"; exit 2;; esac

psql "$DB_URL" -qAtX -c "select count(*) || ' migration nel ledger, ultima ' || max(version) from supabase_migrations.schema_migrations"
psql "$DB_URL" -qX -v ON_ERROR_STOP=1 -f "$ROOT/tests/db/food-club/00_helpers.sql" >/dev/null || { echo "BLOCKED: helper SQL non caricati"; exit 2; }

# Fixture del tempo (session_replication_role = replica): serve il superuser locale dello stack (supabase_admin).
SU_URL="${DB_URL/postgres:postgres@/supabase_admin:postgres@}"
psql "$SU_URL" -qAtX -c "select 1" >/dev/null || { echo "BLOCKED: superuser locale non raggiungibile"; exit 2; }
export P3B_API_URL="$API_URL" P3B_DB_URL="$SU_URL" P3B_ANON_KEY="$ANON_KEY" P3B_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
cd "$ROOT"
node tests/db/food-club/p3b_api_scenarios.mjs
rc=$?
[ $rc -eq 0 ] && echo "P3B-API: OK" || echo "P3B-API: FAIL"
exit $rc
