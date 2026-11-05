#!/usr/bin/env bash
# FOOD CLUB V1 — 6 scenari RF (50_review_fixes.sql) su stack Supabase LOCALE isolato, SENZA e CON la patch proposta.
# Mai remoto: nessun link, push, deploy. supabase/config.toml e supabase/migrations/ del repo non vengono toccati.
#
# Uso, dalla root del worktree:
#   SUPABASE_BIN=/percorso/supabase docs/food-club/implementation/proposed/harness/run-rf-local.sh [WORKDIR]
# Ogni scenario RF gira da solo in BEGIN/ROLLBACK: un FAIL non nasconde gli altri.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
HERE="$ROOT/docs/food-club/implementation/proposed"
SB="${SUPABASE_BIN:-supabase}"
WORK="${1:-$(mktemp -d)}"
EXCL="studio,imgproxy,vector,logflare,mailpit,edge-runtime,storage-api,realtime,postgres-meta,supavisor"
cleanup() { [ "${KEEP_STACK:-0}" = "1" ] || (cd "$WORK" && "$SB" stop --no-backup >/dev/null 2>&1 || true); }
trap cleanup EXIT

mkdir -p "$WORK/supabase"
cp -R "$ROOT/supabase/migrations" "$WORK/supabase/"
python3 - "$ROOT/supabase/config.toml" "$WORK/supabase/config.toml" <<'PY'
import re, sys
s = open(sys.argv[1]).read()
s = re.sub(r'(?m)^project_id = .*', 'project_id = "walbox-fc-rf"', s)
s = re.sub(r'(\[db\.seed\][^\[]*?)enabled = true', r'\1enabled = false', s, flags=re.S)
s = s.replace('auth_token = "env(SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN)"', 'auth_token = "fake-local-only"', 1)
assert 'walbox-fc-rf' in s
open(sys.argv[2], 'w').write(s)
PY

# Spezza 50_review_fixes.sql in un file per scenario (blocchi DO che iniziano con "-- RF")
SPLIT="$WORK/rf"; mkdir -p "$SPLIT"
awk -v d="$SPLIT" '/^-- RF/{n++; f=sprintf("%s/%02d.sql", d, n)} n>0{print > f}' "$HERE/50_review_fixes.sql"

export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres
run_suite() {
  local label="$1"
  echo "===== $label ====="
  psql -qX -v ON_ERROR_STOP=1 -d postgres -f "$ROOT/tests/db/food-club/00_helpers.sql" >/dev/null || { echo "helpers FAIL"; return 1; }
  echo "-- scenari SQL esistenti"
  "$ROOT/tests/db/run-food-club-sql.sh" postgres | grep -E '^(OK|FAIL)'
  echo "-- scenari RF"
  for f in "$SPLIT"/*.sql; do
    name="$(head -1 "$f" | sed 's/^-- //')"
    out=$( { echo 'BEGIN;'; cat "$f"; echo 'ROLLBACK;'; } | psql -qX -v ON_ERROR_STOP=1 -d postgres 2>&1 )
    if [ $? -eq 0 ] && echo "$out" | grep -q 'PASS'; then echo "PASS  $name"
    else echo "FAIL  $name"; echo "$out" | grep -E 'ERROR|ASSERT|assert' | head -2 | sed 's/^/        /'; fi
  done
}

cd "$WORK"
"$SB" start -x "$EXCL" >/dev/null || { echo "BLOCKED: supabase start fallito"; exit 2; }
DBURL="$("$SB" status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
case "$DBURL" in postgresql://*@127.0.0.1:54322/*) ;; *) echo "rifiuto: DB non locale ($DBURL)"; exit 2;; esac
echo "Stack locale: $DBURL · migration: $(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
run_suite "SENZA patch"

cp "$HERE/20261105104000_food_club_v1_review_fixes.sql" "$WORK/supabase/migrations/"
"$SB" db reset --local >/dev/null 2>&1 || { echo "BLOCKED: db reset con patch fallito"; "$SB" db reset --local 2>&1 | tail -15; exit 2; }
echo "Migration dopo reset: $(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
run_suite "CON patch 20261105104000"
