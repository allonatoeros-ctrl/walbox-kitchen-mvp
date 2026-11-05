#!/usr/bin/env bash
# AUDIT RIMBORSI — 52_refund_audit.sql (+ T18 proposto) su stack Supabase LOCALE isolato, due passate:
#   RED   = 74 migration + proposed 104000 + 105000 (Opzione C), senza la correzione -> RA1..RA4 attesi FAIL
#   GREEN = RED + proposed 20261105106000_payments_refund_least_privilege.sql -> tutto PASS + regressioni
# Isolamento identico a run-oc-local.sh (project_id walbox-fc-oc, seed spento, DB 127.0.0.1:54322, mai remoto).
# Uso dalla root del worktree: SUPABASE_BIN=/percorso/supabase docs/food-club/implementation/proposed/harness/run-ra-local.sh WORKDIR
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
HERE="$ROOT/docs/food-club/implementation/proposed"
SB="${SUPABASE_BIN:-supabase}"
WORK="${1:?WORKDIR richiesta}"
EXCL="studio,imgproxy,vector,logflare,mailpit,edge-runtime,storage-api,realtime,postgres-meta,supavisor"
cleanup() { [ "${KEEP_STACK:-0}" = "1" ] || (cd "$WORK" && "$SB" stop --no-backup >/dev/null 2>&1 || true); }
trap cleanup EXIT

mkdir -p "$WORK/supabase"
fresh_migrations() {  # $1 = 0 senza correzione, 1 con correzione
  local d="$WORK/supabase/migrations"
  [ -d "$d" ] && mv "$d" "$WORK/old_migrations_$(date +%s%N)"
  cp -R "$ROOT/supabase/migrations" "$WORK/supabase/"
  cp "$HERE/20261105104000_food_club_v1_review_fixes.sql" "$HERE/20261105105000_food_club_v1_option_c.sql" "$d/"
  [ "$1" = "1" ] && cp "$HERE/20261105106000_payments_refund_least_privilege.sql" "$d/"
  return 0
}
python3 - "$ROOT/supabase/config.toml" "$WORK/supabase/config.toml" <<'PY'
import re, sys
s = open(sys.argv[1]).read()
s = re.sub(r'(?m)^project_id = .*', 'project_id = "walbox-fc-oc"', s)
s = re.sub(r'(\[db\.seed\][^\[]*?)enabled = true', r'\1enabled = false', s, flags=re.S)
s = s.replace('auth_token = "env(SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN)"', 'auth_token = "fake-local-only"', 1)
assert 'walbox-fc-oc' in s
open(sys.argv[2], 'w').write(s)
PY

export PGHOST=127.0.0.1 PGPORT=54322 PGUSER=postgres PGPASSWORD=postgres
split_run() {  # $1 file, $2 prefisso intestazioni (RA, OC, RF, T18)
  local dir; dir="$(mktemp -d "$WORK/split.XXXX")"
  awk -v d="$dir" -v p="^-- $2" '$0 ~ p {n++; f=sprintf("%s/%02d.sql", d, n)} n>0{print > f}' "$1"
  for f in "$dir"/*.sql; do
    name="$(head -1 "$f" | sed 's/^-- //' | cut -c1-100)"
    out=$( { echo 'BEGIN;'; cat "$f"; echo 'ROLLBACK;'; } | psql -qX -v ON_ERROR_STOP=1 -d postgres 2>&1 )
    if [ $? -eq 0 ] && echo "$out" | grep -q 'PASS'; then echo "PASS  $name"
    else echo "FAIL  $name"; echo "$out" | grep -E 'ERROR' | head -1 | cut -c1-220 | sed 's/^/        /'; fi
    [ "${SHOW_EVID:-1}" = "1" ] && echo "$out" | grep -oE 'EVID .*' | cut -c1-260 | sed 's/^/        /'
  done
}
helpers() {
  for h in "$ROOT/tests/db/food-club/00_helpers.sql" "$HERE/harness/oc-helpers.sql"; do
    psql -qX -v ON_ERROR_STOP=1 -d postgres -f "$h" >/dev/null || { echo "BLOCKED helper $h"; return 1; }
  done
}
grants() {
  psql -qX -d postgres -At -F' ' -c "select rpad(p.proname,44), 'anon=' || has_function_privilege('anon',p.oid,'EXECUTE'),
    'auth=' || has_function_privilege('authenticated',p.oid,'EXECUTE')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and (p.proname ~ '^kitchen_(payment|order)_' ) and p.prorettype <> 'trigger'::regtype order by 1" | sed 's/^/  /'
}

cd "$WORK"
"$SB" status >/dev/null 2>&1 || "$SB" start -x "$EXCL" >/dev/null || { echo "BLOCKED: supabase start fallito"; exit 2; }
DBURL="$("$SB" status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
case "$DBURL" in postgresql://*@127.0.0.1:54322/*) ;; *) echo "rifiuto: DB non locale ($DBURL)"; exit 2;; esac

for phase in RED GREEN; do
  fresh_migrations "$([ "$phase" = GREEN ] && echo 1 || echo 0)"
  "$SB" db reset --local >/dev/null 2>&1 || { echo "BLOCKED: db reset $phase"; "$SB" db reset --local 2>&1 | tail -10; exit 2; }
  echo "===== $phase · migration: $(ls supabase/migrations/*.sql | wc -l | tr -d ' ') ====="
  helpers || exit 2
  split_run "$HERE/52_refund_audit.sql" RA
  echo "-- T18 proposto (tests/db/food-club/10_rules_payments.sql, solo T18)"
  split_run "$HERE/53_T18_update.sql" T18
  if [ "$phase" = GREEN ]; then
    echo "-- GRANT dopo la correzione"; grants
    echo "-- regressione: Opzione C (51) + concorrenza OC10"
    SHOW_EVID=0 split_run "$HERE/51_option_c.sql" OC
    bash "$HERE/harness/oc10-concurrency.sh"
    echo "-- regressione: RF (50)"
    SHOW_EVID=0 split_run "$HERE/50_review_fixes.sql" RF
    echo "-- regressione: scenari SQL esistenti tests/db/food-club"
    "$ROOT/tests/db/run-food-club-sql.sh" postgres 2>&1 | grep -E '^(OK|FAIL)|ERROR' | cut -c1-200
  fi
done
