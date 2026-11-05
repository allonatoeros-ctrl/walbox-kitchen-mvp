#!/usr/bin/env bash
# FOOD CLUB V1 — test Opzione C (51_option_c.sql + OC10 concorrenza) su stack Supabase LOCALE isolato.
# Stesso isolamento di run-rf-local.sh: copia di migrations/config in WORKDIR temporanea, project_id dedicato,
# seed spento, controllo DB = 127.0.0.1:54322, stack fermato a fine run. Mai remoto, mai link/push/deploy.
#
# Uso, dalla root del worktree:
#   SUPABASE_BIN=/percorso/supabase docs/food-club/implementation/proposed/harness/run-oc-local.sh [WORKDIR]
# ASSERTS_OFF=1: controllo dei test stessi (ASSERT spenti): ogni passo deve girare senza errori di runtime,
#   tranne le chiamate alle funzioni dell'Opzione C non ancora esistenti. Salta OC10.
# Suite: base (74), base + patch 20261105104000, base + patch + Opzione C 20261105105000 (+ regressioni SQL e RF).
# ONLY_OPTION_C=1: solo la terza suite.
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
s = re.sub(r'(?m)^project_id = .*', 'project_id = "walbox-fc-oc"', s)
s = re.sub(r'(\[db\.seed\][^\[]*?)enabled = true', r'\1enabled = false', s, flags=re.S)
s = s.replace('auth_token = "env(SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN)"', 'auth_token = "fake-local-only"', 1)
assert 'walbox-fc-oc' in s
open(sys.argv[2], 'w').write(s)
PY

SPLIT="$WORK/oc"; mkdir -p "$SPLIT"
awk -v d="$SPLIT" '/^-- OC/{n++; f=sprintf("%s/%02d.sql", d, n)} n>0{print > f}' "$HERE/51_option_c.sql"

export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres
run_suite() {
  echo "===== $1 ====="
  for h in "$ROOT/tests/db/food-club/00_helpers.sql" "$HERE/harness/oc-helpers.sql"; do
    psql -qX -v ON_ERROR_STOP=1 -d postgres -f "$h" >/dev/null || { echo "BLOCKED helper $h"; return 1; }
  done
  for f in "$SPLIT"/*.sql; do
    name="$(head -1 "$f" | sed 's/^-- //' | cut -c1-90)"
    out=$( { echo 'BEGIN;'; [ "${ASSERTS_OFF:-0}" = "1" ] && echo 'SET LOCAL plpgsql.check_asserts = off;'; cat "$f"; echo 'ROLLBACK;'; } | psql -qX -v ON_ERROR_STOP=1 -d postgres 2>&1 )
    if [ $? -eq 0 ] && echo "$out" | grep -q 'PASS'; then echo "PASS  $name"
    else echo "FAIL  $name"; echo "$out" | grep -E 'ERROR|ASSERT|assert' | head -2 | cut -c1-200 | sed 's/^/        /'; fi
  done
  [ "${ASSERTS_OFF:-0}" = "1" ] || bash "$HERE/harness/oc10-concurrency.sh"
}

cd "$WORK"
"$SB" start -x "$EXCL" >/dev/null || { echo "BLOCKED: supabase start fallito"; exit 2; }
DBURL="$("$SB" status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
case "$DBURL" in postgresql://*@127.0.0.1:54322/*) ;; *) echo "rifiuto: DB non locale ($DBURL)"; exit 2;; esac
echo "Stack locale: $DBURL · migration: $(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
if [ "${ONLY_OPTION_C:-0}" != "1" ]; then
  run_suite "BASE (migration attuali)"
fi

cp "$HERE/20261105104000_food_club_v1_review_fixes.sql" "$WORK/supabase/migrations/"
if [ "${ONLY_OPTION_C:-0}" != "1" ]; then
  "$SB" db reset --local >/dev/null 2>&1 || { echo "BLOCKED: db reset con patch fallito"; exit 2; }
  echo "Migration dopo reset: $(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
  run_suite "BASE + patch 20261105104000"
fi

# Suite 3: base + patch P1 + Opzione C proposta, con regressioni (scenari SQL esistenti + RF della patch P1).
cp "$HERE/20261105105000_food_club_v1_option_c.sql" "$WORK/supabase/migrations/"
"$SB" db reset --local >/dev/null 2>&1 || { echo "BLOCKED: db reset con Opzione C fallito"; "$SB" db reset --local 2>&1 | tail -15; exit 2; }
echo "Migration dopo reset: $(ls supabase/migrations/*.sql | wc -l | tr -d ' ')"
run_suite "BASE + patch 20261105104000 + OPZIONE C 20261105105000"
echo "-- regressione: scenari SQL esistenti (tests/db/food-club 10/20/30/40)"
"$ROOT/tests/db/run-food-club-sql.sh" postgres 2>&1 | grep -E '^(OK|FAIL)|ERROR' | cut -c1-200
echo "-- regressione: scenari RF (50_review_fixes.sql)"
RFS="$WORK/rf"; mkdir -p "$RFS"
awk -v d="$RFS" '/^-- RF/{n++; f=sprintf("%s/%02d.sql", d, n)} n>0{print > f}' "$HERE/50_review_fixes.sql"
for f in "$RFS"/*.sql; do
  name="$(head -1 "$f" | sed 's/^-- //' | cut -c1-90)"
  out=$( { echo 'BEGIN;'; cat "$f"; echo 'ROLLBACK;'; } | psql -qX -v ON_ERROR_STOP=1 -d postgres 2>&1 )
  if [ $? -eq 0 ] && echo "$out" | grep -q 'PASS'; then echo "PASS  $name"
  else echo "FAIL  $name"; echo "$out" | grep -E 'ERROR' | head -2 | cut -c1-200 | sed 's/^/        /'; fi
done
