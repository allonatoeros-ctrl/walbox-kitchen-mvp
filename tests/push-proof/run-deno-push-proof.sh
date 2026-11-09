#!/usr/bin/env bash
# Prova end-to-end LOCALE della Edge Function send-food-club-push sotto Deno, con la vera libreria web-push:
#   coda reale (clone del DB Postgres locale) -> PostgREST finto (fakes.cjs, RPC via psql) -> index.ts (Deno.serve)
#   -> push service finto HTTPS su 127.0.0.1:8443 che DECIFRA il payload aes128gcm con le chiavi della sottoscrizione.
# Nessun push service reale, nessun Supabase reale: chiavi VAPID e chiavi di sottoscrizione generate al volo.
# Rete esterna: solo il registry npm (installazione di deno/web-push nella cartella di lavoro e moduli npm: di Deno).
# Prerequisiti: Postgres locale con walbox_fc_test migrato + helper fc_test (tests/db/apply-migrations.sh e
# tests/db/run-food-club-sql.sh). Uso: tests/push-proof/run-deno-push-proof.sh [cartella_di_lavoro]
# Esito atteso: a=sent (1 endpoint ok), b=sent e endpoint 410 cancellato, c=skipped no_club_subscription (unico
# endpoint 410), d=queued timeout (push service che non risponde, timeout 8 s), 401 senza secret o con secret errato.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"; DB=walbox_fc_deno
WORK="${1:-$(mktemp -d)}"; OUT="$WORK/out"; RUN="$WORK/run"; TOOLS="$WORK/tools"
mkdir -p "$OUT" "$RUN" "$TOOLS"; : > "$OUT/rpc.log"; echo '[]' > "$OUT/received.json"
export PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres
fail=0; ko() { echo "FAIL $*"; fail=1; }

# 1) strumenti (solo nella cartella di lavoro, mai nel repo)
[ -x "$TOOLS/node_modules/.bin/deno" ] || (cd "$TOOLS" && npm init -y >/dev/null && npm install --no-audit --no-fund deno web-push@3 >/dev/null 2>&1) \
  || { echo "installazione deno/web-push fallita (rete verso il registry npm?)"; exit 2; }
DENO="$TOOLS/node_modules/.bin/deno"; export NODE_PATH="$TOOLS/node_modules"

# 2) CA e certificato locale per il push service finto
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout "$OUT/ca.key" -out "$OUT/ca.pem" -days 2 \
  -subj "/CN=Walbox Push Proof CA" -addext basicConstraints=critical,CA:TRUE -addext keyUsage=critical,keyCertSign 2>/dev/null
openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -keyout "$OUT/key.pem" -out "$OUT/leaf.csr" -subj /CN=127.0.0.1 2>/dev/null
printf 'subjectAltName=IP:127.0.0.1,DNS:localhost\nextendedKeyUsage=serverAuth\n' > "$OUT/ext.cnf"
openssl x509 -req -in "$OUT/leaf.csr" -CA "$OUT/ca.pem" -CAkey "$OUT/ca.key" -CAcreateserial -out "$OUT/cert.pem" -days 2 -extfile "$OUT/ext.cnf" 2>/dev/null
CERTS="$OUT/ca.pem"; [ -f /root/.ccr/ca-bundle.crt ] && { cat /root/.ccr/ca-bundle.crt "$OUT/ca.pem" > "$OUT/bundle.pem"; CERTS="$OUT/bundle.pem"; }

# 3) DB clone con 4 iscritti e un timbro in coda ciascuno
psql -qX -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" -c "CREATE DATABASE $DB TEMPLATE walbox_fc_test" >/dev/null || exit 1
q() { psql -qAtX -v ON_ERROR_STOP=1 -d "$DB" "$@"; }
node -e '
const c=require("node:crypto"); const out={};
for (const n of ["a1","b1","b2","c1","d1"]) { const e=c.createECDH("prime256v1"); e.generateKeys();
  out[n]={priv:e.getPrivateKey().toString("base64url"), pub:e.getPublicKey().toString("base64url"), auth:c.randomBytes(16).toString("base64url")}; }
require("node:fs").writeFileSync(process.argv[1], JSON.stringify(out));' "$OUT/subkeys.json"
k() { node -e 'const k=require(process.argv[1]); console.log(k[process.argv[2]][process.argv[3]])' "$OUT/subkeys.json" "$1" "$2"; }
q -c "CREATE TABLE fc_test.u (tag text PRIMARY KEY, id uuid);" \
  -c "UPDATE public.food_club_messages SET push_status = 'skipped' WHERE push_status IN ('queued','sending');" \
  -c "SELECT fc_test.activate_campaign();" >/dev/null || exit 1
for spec in "a a1 ok" "b b1 ok" "b b2 gone" "c c1 gone" "d d1 hang"; do set -- $spec
  q -c "INSERT INTO fc_test.u SELECT '$1', fc_test.new_member() WHERE NOT EXISTS (SELECT 1 FROM fc_test.u WHERE tag = '$1');" \
    -c "SELECT fc_test.as_user((SELECT id FROM fc_test.u WHERE tag = '$1'));
        SELECT public.food_club_push_subscribe('walrus-main', 'https://127.0.0.1:8443/$3/$2', '$(k $2 pub)', '$(k $2 auth)', 'push-proof', 'club', 'push-club-v1');" >/dev/null || exit 1
done
q -c "SELECT fc_test.as_service(); SELECT public.food_club_enqueue_message(id, 'stamp', 'proof-' || tag, '+1 TIMBRO 🦭', 'Visita contata (' || tag || ').', '/kitchen/club') FROM fc_test.u;" >/dev/null

# 4) server finti + funzione sotto Deno (copia dei file: Deno non scrive nulla nel repo)
cp "$REPO/supabase/functions/send-food-club-push/index.ts" "$REPO/supabase/functions/send-food-club-push/logic.js" "$RUN/"
node "$HERE/fakes.cjs" "$DB" "$OUT" > "$OUT/fakes.log" 2>&1 & FAKES=$!
VAPID=$(cd "$TOOLS" && node -e 'console.log(JSON.stringify(require("web-push").generateVAPIDKeys()))')
(
  cd "$RUN"
  export NODE_EXTRA_CA_CERTS="$OUT/ca.pem" NO_PROXY="127.0.0.1,localhost" no_proxy="127.0.0.1,localhost"
  export DENO_DIR="$WORK/.deno" DENO_NO_UPDATE_CHECK=1
  export FOOD_CLUB_PUSH_SECRET=proof-secret SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=dummy-not-a-key
  export VAPID_PUBLIC_KEY="$(echo "$VAPID" | node -pe 'JSON.parse(require("fs").readFileSync(0)).publicKey')"
  export VAPID_PRIVATE_KEY="$(echo "$VAPID" | node -pe 'JSON.parse(require("fs").readFileSync(0)).privateKey')"
  export VAPID_SUBJECT=mailto:push-proof@example.invalid
  # --allow-sys: web-push legge i certificati di sistema (os.ca); senza, ogni invio fallisce come 'network'.
  exec "$DENO" run --no-lock --cert "$CERTS" --allow-net --allow-env --allow-read --allow-sys index.ts
) > "$OUT/deno.log" 2>&1 & DENOPID=$!
trap 'kill $FAKES $DENOPID 2>/dev/null' EXIT
P="node $HERE/post.cjs http://127.0.0.1:8000"
for _ in $(seq 1 120); do $P >/dev/null 2>&1 && break; sleep 1; done

# 5) chiamate e verifiche
[ "$($P | cut -d' ' -f1)" = 401 ] || ko "senza secret non 401"
[ "$($P wrong | cut -d' ' -f1)" = 401 ] || ko "secret errato non 401"
T0=$(date +%s); r=$($P proof-secret); echo "tick: $r ($(( $(date +%s) - T0 )) s)"; [ "${r%% *}" = 200 ] || ko "tick non 200"
st() { q -c "SELECT m.push_status || ':' || coalesce(m.push_skip_reason, '-') || ':' || (SELECT count(*) FROM public.kitchen_push_subscriptions s WHERE s.customer_id = u.id)
              FROM fc_test.u u JOIN public.food_club_messages m ON m.user_id = u.id WHERE u.tag = '$1'"; }
for exp in "a sent:-:1" "b sent:-:1" "c skipped:no_club_subscription:0" "d queued:timeout:1"; do set -- $exp
  got=$(st "$1"); [ "$got" = "$2" ] && echo "PASS $1 $got" || ko "$1 atteso $2, trovato $got"
done
node -e '
const rec = require(process.argv[1]); let bad = 0;
for (const r of rec) {
  const p = r.payload;
  const ok = r.encoding === "aes128gcm" && r.vapid && r.ttl === "43200" && p && p.tag === "food-club-stamp"
    && /^\/kitchen\/club\?n=[0-9a-f-]{36}$/.test(p.url) && p.data.url === p.url && !JSON.stringify(p).includes("user_id");
  if (!ok) { bad += 1; console.log("FAIL payload", r.path, r.decryptError || JSON.stringify(p)); }
}
const paths = new Set(rec.map((r) => r.path));
for (const want of ["/ok/a1", "/ok/b1", "/gone/b2", "/gone/c1", "/hang/d1"]) if (!paths.has(want)) { bad += 1; console.log("FAIL manca", want); }
console.log(bad ? "FAIL payload" : `PASS ${rec.length} push decifrate (aes128gcm, VAPID, TTL 12 h, tag per tipo, nessun user_id)`);
process.exit(bad ? 1 : 0);' "$OUT/received.json" || fail=1
if grep -q '"endpoint"\|push.test\|127.0.0.1:8443\|Visita contata' "$OUT/deno.log"; then ko "log con endpoint o testi"; else echo "PASS log senza endpoint/testi"; fi
[ $fail -eq 0 ] && echo "OK prova Deno push (output in $OUT)" || echo "FAIL prova Deno push (output in $OUT)"
exit $fail
