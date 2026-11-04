#!/usr/bin/env bash
# FOOD CLUB V1 — collaudo completo su stack Supabase LOCALE e isolato (Docker/OrbStack). Mai remoto.
# Ripete il collaudo della revisione 2026-11-04 (vedi ../../REVIEW-2026-11-04.md).
#
# Uso, dalla root del repo:
#   docs/food-club/implementation/proposed/harness/run-local-review.sh            # senza patch di revisione
#   WITH_FIXES=1 docs/food-club/implementation/proposed/harness/run-local-review.sh  # + 20261105104000 (proposta)
#   KEEP_STACK=1 ...   per lasciare lo stack acceso a fine run
#
# Cosa fa: copia migration/funzioni/config in una cartella temporanea e, SOLO nella copia, abilita
# anonymous sign-in, SMS con numeri di test (+39 333 000 000 1/2/3, codice 123456, provider Twilio finto)
# e "Confirm phone". supabase/config.toml del repo non viene toccato. Nessun link, push, deploy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../../../.." && pwd)"
HERE="$ROOT/docs/food-club/implementation/proposed"
WORK="$(mktemp -d)"
SB=(npx --prefix "$ROOT" supabase)
cleanup() {
  [ -n "${VITE_PIDS:-}" ] && kill $VITE_PIDS 2>/dev/null || true
  [ "${KEEP_STACK:-0}" = "1" ] || (cd "$WORK" && "${SB[@]}" stop --no-backup >/dev/null 2>&1 || true)
}
trap cleanup EXIT

mkdir -p "$WORK/supabase"
cp -R "$ROOT/supabase/migrations" "$ROOT/supabase/functions" "$WORK/supabase/"
[ "${WITH_FIXES:-0}" = "1" ] && cp "$HERE/20261105104000_food_club_v1_review_fixes.sql" "$WORK/supabase/migrations/"
python3 - "$ROOT/supabase/config.toml" "$WORK/supabase/config.toml" <<'PY'
import re, sys
s = open(sys.argv[1]).read()
s = re.sub(r'(?m)^project_id = .*', 'project_id = "walbox-fc-review"', s)
s = re.sub(r'(?m)^enable_anonymous_sign_ins = false', 'enable_anonymous_sign_ins = true', s)
s = re.sub(r'(\[db\.seed\][^\[]*?)enabled = true', r'\1enabled = false', s, flags=re.S)
s = re.sub(r'(\[auth\.sms\][^\[]*?)enable_signup = false', r'\1enable_signup = true', s, flags=re.S)
s = re.sub(r'(\[auth\.sms\][^\[]*?)enable_confirmations = false', r'\1enable_confirmations = true', s, flags=re.S)
s = s.replace('# [auth.sms.test_otp]\n# 4152127777 = "123456"',
  '[auth.sms.test_otp]\n393330000001 = "123456"\n393330000002 = "123456"\n393330000003 = "123456"')
s = re.sub(r'\[auth\.sms\.twilio\]\nenabled = false\naccount_sid = ""\nmessage_service_sid = ""',
  '[auth.sms.twilio]\nenabled = true\naccount_sid = "ACfake"\nmessage_service_sid = "MGfake"', s)
s = s.replace('auth_token = "env(SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN)"', 'auth_token = "fake-local-only"', 1)
for must in ('enable_anonymous_sign_ins = true', '393330000001', 'enable_confirmations = true', 'ACfake'):
    assert must in s, 'patch config fallita: ' + must
open(sys.argv[2], 'w').write(s)
PY

cd "$WORK"
"${SB[@]}" start -x studio,imgproxy,vector,logflare,mailpit
eval "$("${SB[@]}" status -o env | grep -E '^(API_URL|ANON_KEY|DB_URL)=')"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) echo "rifiuto: API non locale"; exit 2;; esac
cd "$ROOT"
export VITE_SUPABASE_URL="$API_URL" VITE_SUPABASE_ANON_KEY="$ANON_KEY" PGPASSWORD=postgres
export PGHOST=127.0.0.1 PGPORT=54322 FC_TEST_DB=postgres SHOT_DIR="$WORK"

echo "== 1) scenari SQL (44) =="
tests/db/run-food-club-sql.sh postgres
if [ "${WITH_FIXES:-0}" = "1" ]; then
  echo "== 1b) scenari revisione (RF1..RF5) =="
  { echo 'BEGIN;'; cat "$HERE/50_review_fixes.sql"; echo 'ROLLBACK;'; } \
    | psql -U postgres -d postgres -qX -v ON_ERROR_STOP=1 2>&1 | grep -E 'PASS|ERROR'
fi
echo "== 2) collaudo HTTP (GoTrue + PostgREST) =="
node "$HERE/harness/fc-http.mjs"
echo "== 3) checkout nel browser, flag spento / acceso =="
npx vite --host 127.0.0.1 --port 5181 >/dev/null 2>&1 & VITE_PIDS="$!"
VITE_FOOD_CLUB_ENABLED=true npx vite --host 127.0.0.1 --port 5182 >/dev/null 2>&1 & VITE_PIDS="$VITE_PIDS $!"
sleep 6
node "$HERE/harness/fc-checkout.cjs" 5181 off
node "$HERE/harness/fc-checkout.cjs" 5182 on
echo "== 4) concorrenza (lascia dati nel DB locale: va per ultima) =="
node --test tests/db/food-club-concurrency.test.mjs
echo "Screenshot: $WORK"
