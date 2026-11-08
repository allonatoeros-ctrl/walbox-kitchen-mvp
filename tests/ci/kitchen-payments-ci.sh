#!/usr/bin/env bash
# Runner unico della CI "Kitchen pagamenti" (PR #15: K1 K2 K3 K4 K6 R3). Lo usano sia il workflow
# .github/workflows/kitchen-payments.yml sia la prova locale: stessi comandi, stessi controlli.
#
# Uso: PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres PGPASSWORD=... bash tests/ci/kitchen-payments-ci.sh <fase>
# Fasi: guard | lint | unit | migrations | db | r3 | build | all
# Variabili: KP_CI_OUT (cartella log, default mktemp), KP_LINT_BASE (sha base per il lint, default merge-base con main).
#
# Regole:
# - Solo Postgres LOCALE (127.0.0.1/localhost/socket) e porta 54329; mai credenziali o URL di produzione.
# - Ogni processo Node delle fasi lint/unit/migrations/r3/build gira con tests/ci/no-remote-network.mjs:
#   connessioni verso host non loopback bloccate e registrate; un solo tentativo fa fallire la fase.
# - Nessun test puo' "saltarsi" in silenzio: gli skip sono ammessi solo se elencati qui sotto per nome.
#
# ESCLUSIONE MIRATA (unica, documentata, verificata a ogni run):
#   tests/unit/kitchen-analytics-service-night-selector.test.mjs
#   Motivo: test dipendente dalla data. Fissa now=2026-09-21 ma isLiveServiceNight(null) usa l'orologio reale
#   (serviceNightWindowFor(null) -> serviceNightWindow() senza `now`), quindi fallisce in ogni giorno diverso dalla
#   serata del 21/09. Il codice testato (src/hooks/useKitchenPayments.js isLiveServiceNight, src/lib/kitchenServiceRules.js)
#   e' identico su main: non e' un difetto della PR.
#   Verifica: la fase unit esegue comunque il file da solo e controlla che fallisca SOLO con il messaggio noto.
#   Se passa -> avviso "togliere l'esclusione"; se fallisce con un altro errore -> la fase fallisce.
#   Togliere l'esclusione quando il test passa `now` anche a serviceNightWindowFor o fissa l'orologio.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 2
OUT="${KP_CI_OUT:-$(mktemp -d)}"; mkdir -p "$OUT"
export KP_CI_NET_LOG="$OUT/net-blocked.log"
DB=walbox_kp_test

UNIT_EXCLUDE=("tests/unit/kitchen-analytics-service-night-selector.test.mjs")
UNIT_EXCLUDE_KNOWN_MSG="nightParam assente deve essere sempre live"
# Skip ammessi (nome esatto del test). Questo si salta senza il backup locale di produzione, che in CI non c'e' mai.
UNIT_SKIP_ALLOW=("dati reali: i pagamenti seguono la serata dell ordine, non il giorno di calendario")
R3_MIN_TESTS=5

die() { echo "::error::$*"; echo "FAIL: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

guard_url() { node -p 'require("node:url").pathToFileURL(process.argv[1]).href' "$ROOT/tests/ci/no-remote-network.mjs"; }
with_net_guard() { NODE_OPTIONS="--import=$(guard_url) ${NODE_OPTIONS:-}" "$@"; }
check_net_log() { if [ -s "$KP_CI_NET_LOG" ]; then cat "$KP_CI_NET_LOG"; die "$1: tentata connessione verso host remoto (vedi sopra)"; fi; }

# Conta da file TAP del test runner di Node: tests/pass/fail/skipped e nomi dei test saltati.
tap_num() { grep -E "^# $2 [0-9]+$" "$1" | tail -1 | awk '{print $3}'; }
tap_skips() { grep -E '^\s*ok [0-9]+ - .* # SKIP' "$1" | sed -E 's/^\s*ok [0-9]+ - (.*) # SKIP.*/\1/'; }
run_tap() { # run_tap <nome> <file...>
  local name="$1"; shift
  with_net_guard node --test --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter=tap --test-reporter-destination="$OUT/$name.tap" "$@"
}

require_local_pg() {
  case "${PGHOST:-}" in /*|127.0.0.1|localhost) ;; *) die "PGHOST deve essere locale (127.0.0.1/localhost/socket), trovato '${PGHOST:-}'";; esac
  [ "${PGPORT:-}" = 54329 ] || die "PGPORT deve essere 54329, trovato '${PGPORT:-}'"
  [ -z "${PGHOSTADDR:-}${PGSERVICE:-}${PGSERVICEFILE:-}${DATABASE_URL:-}" ] || die "PGHOSTADDR/PGSERVICE/DATABASE_URL non ammessi"
}

phase_guard() {
  echo "== guard: niente DB remoti, niente credenziali di produzione =="
  require_local_pg
  # 1) Nessuna variabile d'ambiente con credenziali/URL di Supabase, SumUp, Vercel, Web Push.
  local bad
  bad=$(env | cut -d= -f1 | grep -E '^(SUPABASE_|SUMUP_|VAPID_|VERCEL_|WEBPUSH_|CRON_SECRET|SERVICE_ROLE)|^VITE_SUPABASE_ANON_KEY$|_SERVICE_ROLE|ACCESS_TOKEN$' | grep -vE '^VERCEL_URL$' || true)
  [ -z "$bad" ] || die "variabili sensibili presenti nell'ambiente: $(echo "$bad" | tr '\n' ' ')"
  # 2) Nessun valore d'ambiente che punti a un progetto Supabase remoto o a SumUp.
  if env | cut -d= -f2- | grep -qiE 'supabase\.co|pcrqfdzipotprqtuemso|api\.sumup\.com'; then die "un valore d'ambiente punta a Supabase/SumUp remoto"; fi
  # 3) Nessun file .env* nel checkout (in CI non devono esistere; in locale si prova su una copia pulita).
  local envf; envf=$(find . -path ./node_modules -prune -o -name '.env*' -type f ! -name '.env.example' -print | head -5)
  [ -z "$envf" ] || die "file .env presenti nel checkout: $envf"
  # 4) Il workflow non usa secrets.
  if grep -nE 'secrets\.' .github/workflows/kitchen-payments.yml; then die "il workflow kitchen-payments usa secrets"; fi
  # 5) La guardia di rete funziona davvero (anche nei figli di node --test, via NODE_OPTIONS).
  : > "$KP_CI_NET_LOG"
  with_net_guard node -e "fetch('https://ci-guard-selftest.invalid/').then(()=>process.exit(3),e=>process.exit((e.cause?.code||e.code)==='ERR_CI_REMOTE_BLOCKED'?0:4))" 2>/dev/null
  local rc=$?
  [ $rc -eq 0 ] && grep -q 'ci-guard-selftest.invalid' "$KP_CI_NET_LOG" || die "guardia di rete non attiva (rc=$rc)"
  : > "$KP_CI_NET_LOG"
  # 6) Postgres raggiungibile e locale.
  psql -qAtX -d postgres -c "select 'server ' || current_setting('server_version') || ' su ' || coalesce(inet_server_addr()::text,'socket')" || die "Postgres locale non raggiungibile"
  psql --version
  node --version
  ok "guard"
}

phase_lint() {
  echo "== lint: lint completo (informativo) + nessun problema nuovo nei file della PR =="
  local base="${KP_LINT_BASE:-$(git merge-base origin/main HEAD 2>/dev/null || git merge-base main HEAD)}"
  [ -n "$base" ] || die "base per il lint non trovata"
  with_net_guard npx eslint . -f json -o "$OUT/eslint-full.json" >/dev/null 2>&1
  node -e 'const r=require(process.argv[1]);const e=r.reduce((a,f)=>a+f.errorCount,0),w=r.reduce((a,f)=>a+f.warningCount,0);console.log(`Lint completo (informativo, preesistente su main): ${e} errori, ${w} warning in ${r.filter(f=>f.errorCount+f.warningCount).length} file`)' "$OUT/eslint-full.json"
  with_net_guard node tests/ci/lint-no-new-problems.mjs "$base" || die "lint: la PR aggiunge problemi nei file che tocca"
  check_net_log lint
  ok "lint"
}

phase_unit() {
  echo "== unit: src/lib, api/_lib, tests/unit (1 esclusione mirata) =="
  [ ${#UNIT_EXCLUDE[@]} -eq 1 ] || die "le esclusioni unit devono essere esattamente 1 (trovate ${#UNIT_EXCLUDE[@]})"
  local x files=()
  for x in "${UNIT_EXCLUDE[@]}"; do [ -f "$x" ] || die "file escluso inesistente: $x"; done
  for x in src/lib/*.test.js api/_lib/*.test.js tests/unit/*.test.mjs; do
    [[ " ${UNIT_EXCLUDE[*]} " == *" $x "* ]] || files+=("$x")
  done
  echo "File di test: ${#files[@]} (esclusi: ${UNIT_EXCLUDE[*]})"
  : > "$KP_CI_NET_LOG"
  run_tap unit "${files[@]}"; local rc=$?
  local t p f s; t=$(tap_num "$OUT/unit.tap" tests); p=$(tap_num "$OUT/unit.tap" pass); f=$(tap_num "$OUT/unit.tap" fail); s=$(tap_num "$OUT/unit.tap" skipped)
  echo "Unit: tests=$t pass=$p fail=$f skipped=$s (rc=$rc)"
  [ "$rc" -eq 0 ] && [ "${f:-1}" = 0 ] && [ "${t:-0}" -gt 0 ] || die "unit: test falliti o nessun test eseguito"
  local name
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    printf '%s\n' "${UNIT_SKIP_ALLOW[@]}" | grep -qxF "$name" || die "unit: skip non ammesso: '$name'"
    echo "skip ammesso: $name"
  done < <(tap_skips "$OUT/unit.tap")
  [ "$(tap_skips "$OUT/unit.tap" | grep -c .)" = "${s:-0}" ] || die "unit: conteggio skip incoerente"
  check_net_log unit
  # Verifica dell'esclusione: deve fallire SOLO per il motivo noto.
  local xo; xo=$(with_net_guard node --test "${UNIT_EXCLUDE[0]}" 2>&1); local xrc=$?
  if [ $xrc -eq 0 ]; then
    echo "::warning::${UNIT_EXCLUDE[0]} ora passa: togliere l'esclusione da tests/ci/kitchen-payments-ci.sh"
  elif echo "$xo" | grep -qF "$UNIT_EXCLUDE_KNOWN_MSG" && [ "$(echo "$xo" | grep -c 'AssertionError')" = 1 ]; then
    echo "Esclusione verificata: ${UNIT_EXCLUDE[0]} fallisce solo per il motivo noto ('$UNIT_EXCLUDE_KNOWN_MSG')"
  else
    echo "$xo" | tail -30; die "il test escluso fallisce per un motivo diverso da quello documentato"
  fi
  check_net_log unit-esclusione
  ok "unit"
}

phase_migrations() {
  echo "== migrations: test sul testo SQL delle migration K (20261108*) =="
  : > "$KP_CI_NET_LOG"
  local files=(supabase/migrations/20261108*.test.js)
  [ -f "${files[0]}" ] || die "nessun test migration 20261108*"
  run_tap migrations "${files[@]}"; local rc=$?
  local t f s; t=$(tap_num "$OUT/migrations.tap" tests); f=$(tap_num "$OUT/migrations.tap" fail); s=$(tap_num "$OUT/migrations.tap" skipped)
  echo "Migration K: file=${#files[@]} tests=$t fail=$f skipped=$s (rc=$rc)"
  [ "$rc" -eq 0 ] && [ "${f:-1}" = 0 ] && [ "${s:-1}" = 0 ] && [ "${t:-0}" -gt 0 ] || die "migrations: falliti, saltati o nessun test"
  check_net_log migrations
  ok "migrations"
}

phase_db() {
  echo "== db: migration su Postgres locale + scenari P1-P6, P8 + concorrenza P7, P7c-P7f, P8b =="
  require_local_pg
  unset KP_SKIP_CONCURRENCY
  local log="$OUT/db.log" h=tests/db/kitchen-payments
  bash tests/db/apply-migrations.sh "$DB" 2>&1 | tee "$log"; [ "${PIPESTATUS[0]}" -eq 0 ] || die "apply-migrations fallito"
  bash $h/run-kitchen-payments-sql.sh "$DB" 2>&1 | tee -a "$log"; [ "${PIPESTATUS[0]}" -eq 0 ] || die "scenari SQL / P7 / P8b falliti"
  local n; n=$(ls $h/p[1-6]*.sql $h/p8*.sql | wc -l | tr -d ' ')
  grep -qE "^Scenari P1-P6 \+ P8: $n OK, 0 FAIL" "$log" || die "attesi $n scenari SQL OK"
  grep -qE '^OK +p8_k6_chiusura_manager\.sql$' "$log" || die "P8 non eseguito"
  grep -qx 'P7: OK' "$log" || die "P7 non eseguito o non OK"
  grep -qx 'P8b: OK' "$log" || die "P8b non eseguito o non OK"
  local s m
  for s in p7c_k2_concorrenza:P7c p7d_k4_ordine_lock:P7d p7e_k4_ripetizioni:P7e p7f_cancelled_paid_concorrenza:P7f; do
    m="${s#*:}"; s="${s%%:*}"
    bash "$h/$s.sh" "$DB" 2>&1 | tee "$OUT/$s.log"; [ "${PIPESTATUS[0]}" -eq 0 ] || die "$s fallito"
    grep -qx "$m: OK" "$OUT/$s.log" || die "$m non OK"
  done
  ok "db ($n scenari + P7, P7c, P7d, P7e, P7f, P8b)"
}

phase_r3() {
  echo "== r3: integrazione sweep vera su Postgres locale (skip vietati) =="
  require_local_pg
  : > "$KP_CI_NET_LOG"
  KP_DB="$DB" run_tap r3 tests/db/kitchen-payments/r3_sweep_integrazione.test.mjs; local rc=$?
  local t p f s; t=$(tap_num "$OUT/r3.tap" tests); p=$(tap_num "$OUT/r3.tap" pass); f=$(tap_num "$OUT/r3.tap" fail); s=$(tap_num "$OUT/r3.tap" skipped)
  echo "R3: tests=$t pass=$p fail=$f skipped=$s (rc=$rc)"
  [ "${s:-1}" = 0 ] || die "R3: $s test saltati (KP_DB/PGHOST mancanti?): vietato"
  [ "$rc" -eq 0 ] && [ "${f:-1}" = 0 ] && [ "${t:-0}" -ge "$R3_MIN_TESTS" ] && [ "$p" = "$t" ] || die "R3: falliti o meno di $R3_MIN_TESTS test"
  check_net_log r3
  ok "r3"
}

phase_build() {
  echo "== build con Supabase locale finto, poi controllo del bundle =="
  : > "$KP_CI_NET_LOG"
  VITE_SUPABASE_URL=http://127.0.0.1:54321 with_net_guard npm run build || die "build fallita"
  # URL di un progetto Supabase reale (https://<ref>.supabase.co) o ref di produzione. Il testo "*.supabase.co"
  # di una lista di host consentiti non e' un URL di progetto e non conta.
  if grep -rlE 'https?://[a-z0-9]{10,}\.supabase\.(co|in)|pcrqfdzipotprqtuemso' dist >/dev/null; then die "il bundle contiene un URL Supabase remoto"; fi
  grep -rq '127.0.0.1:54321' dist || die "il bundle non contiene l'URL locale atteso"
  check_net_log build
  ok "build (bundle senza URL remoti)"
}

case "${1:-}" in
  guard) phase_guard ;;
  lint) phase_lint ;;
  unit) phase_unit ;;
  migrations) phase_migrations ;;
  db) phase_db ;;
  r3) phase_r3 ;;
  build) phase_build ;;
  all) phase_guard && phase_lint && phase_unit && phase_migrations && phase_db && phase_r3 && phase_build ;;
  *) echo "uso: $0 guard|lint|unit|migrations|db|r3|build|all" >&2; exit 2 ;;
esac
