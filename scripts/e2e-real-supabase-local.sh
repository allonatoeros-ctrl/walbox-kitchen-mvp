#!/usr/bin/env bash
# E2E REAL SUPABASE LOCAL HARNESS V1
# Avvia uno stack Supabase LOCALE isolato (workdir temporaneo), con anonymous sign-ins
# abilitato e seed Fanta disabilitato SOLO nella copia temporanea di config.toml.
# supabase/config.toml del repo NON viene modificato. Nessun db push / link / production.
# Uso: scripts/e2e-real-supabase-local.sh   (KEEP_STACK=1 per non fermare lo stack)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
SB=(npx supabase)
command -v supabase >/dev/null 2>&1 && SB=(supabase)

cleanup() {
  [ "${KEEP_STACK:-0}" = "1" ] || (cd "$WORK" && "${SB[@]}" stop --no-backup >/dev/null 2>&1 || true)
  rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$WORK/supabase"
cp -R "$ROOT/supabase/migrations" "$WORK/supabase/migrations"
sed -e 's/^enable_anonymous_sign_ins = false/enable_anonymous_sign_ins = true/' \
    -e '/^\[db.seed\]/,/^\[/ s/^enabled = true/enabled = false/' \
    -e 's/^project_id = .*/project_id = "walbox-kitchen-e2e-local"/' \
    "$ROOT/supabase/config.toml" > "$WORK/supabase/config.toml"
grep -q '^enable_anonymous_sign_ins = true' "$WORK/supabase/config.toml" || { echo "patch anon FAILED"; exit 2; }

cd "$WORK"
"${SB[@]}" start -x studio,imgproxy,vector,logflare,mailpit,edge-runtime
eval "$("${SB[@]}" status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"

cd "$ROOT"
VITE_SUPABASE_URL="$API_URL" \
VITE_SUPABASE_ANON_KEY="$ANON_KEY" \
E2E_LOCAL_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  npx playwright test -c playwright.real-local.config.js "$@"
