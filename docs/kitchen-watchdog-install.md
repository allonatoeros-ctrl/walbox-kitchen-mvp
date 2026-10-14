# Kitchen Watchdog V1 — Install

Synthetic monitor for the Kitchen SumUp Payment Hub. Checks 4 known endpoints every 5 minutes and
alerts (Telegram, or stdout/stderr if Telegram is not configured) after **2 consecutive failures of
the same check** (the 4th check raises 2 independent incident episodes — see below).

## Scope V1 (deliberate limits)

- 3 checks are HTTP-status-only (no DB access): no n8n, no AI/LLM calls involved in them.
  - `POST /api/kitchen-sumup-create-checkout` (empty body) → expected `400`
  - `GET /api/kitchen-sumup-reconcile-sweep` (no `Authorization`) → expected `401`
  - `POST /api/kitchen-sumup-webhook` (empty JSON body) → expected `200`
- A 4th check, `payment-order-drift`, is a **read-only sensor over the existing Payment Hub
  reconciliation view** (see "Payment / Order Drift Sensor V1" below) — the one deliberate exception
  to "HTTP only": it calls a Vercel endpoint that itself reads Supabase (server-side, service-role
  key), the Watchdog process only ever sees that endpoint's minimal JSON response.
- Interval: 5 minutes, owned by the systemd **user** timer (the script itself runs once per
  invocation).
- Alert threshold: 2 consecutive failures of the *same* check (alerts once per failure episode, not
  on every failing run after that — a recovery resets the counter). For `payment-order-drift` this
  applies independently to its two incident episodes (business drift vs sensor malfunction).

Anything beyond this (further DB reconciliation checks, n8n orchestration, AI-based anomaly
detection) is out of scope for V1 and would need a separate, explicitly approved task.

## Payment / Order Drift Sensor V1

`GET /api/kitchen-ops/payment-order-drift` (`api/kitchen-ops/payment-order-drift.js`) is a read-only,
server-to-server endpoint over the existing `kitchen_payments_order_reconciliation` view
(`supabase/migrations/20260828100600_kitchen_payment_reporting_views_v1.sql`, unchanged — no new
migration for this feature). It reports orders for `venue_id='walrus-main'`, created at/after the
Payment Hub V1 baseline `2026-08-28T15:53:58.298771Z` (`PAYMENT_HUB_BASELINE_V1` in
`api/_lib/paymentOrderDriftSensor.js`), marked paid without a matching succeeded charge row.

- Auth: `Authorization: Bearer $KITCHEN_OPS_WATCHDOG_TOKEN`, same fixed-token pattern as
  `kitchen-sumup-reconcile-sweep.js`'s `CRON_SECRET` — no session/cookies. The Vercel-side env var
  (`KITCHEN_OPS_WATCHDOG_TOKEN`) and the Watchdog-side env var of the same name must hold the same
  value; neither is created by this task.
- Response body is minimal by design: `{ status, drift_count, records, checked_at }` — `records` is
  capped at 10 minimal rows (`order_id, total, order_created_at`), while `drift_count` reflects the
  **true** total even beyond that cap. Raw Supabase/Postgres errors are logged server-side only, never
  returned in the body.
- `status` is one of `healthy` | `drift` | `sensor_error`. Any query/auth/network failure is
  `sensor_error` — it is never reported as `healthy`.
- The Supabase **service-role key lives only in the Vercel handler**. The Watchdog process on the VPS
  never holds it — it only ever sees this endpoint's HTTP response.

### Two separate incident episodes

The Watchdog's state machine (`ai-ops/watchdog/watchdog.js`) treats `payment-order-drift` specially:
its single check result is projected onto **two independent** consecutive-failure counters instead of
one, because a sensor malfunction must never be confused with (or silently close) a real payment/order
drift:

| Episode | Check name | Increments on | Resets on |
|---|---|---|---|
| Business incident | `payment-order-drift` | `status: 'drift'` | `status: 'healthy'` only — a `sensor_error` leaves it **untouched** |
| Sensor incident | `payment-order-drift-sensor` | `status: 'sensor_error'` | `status: 'healthy'` **or** `status: 'drift'` (either proves the sensor itself is working) |

Each reaches the same 2-consecutive threshold independently and alerts (Telegram + Hermes, if
enabled) as its own episode.

### Hermes evidence for this check

In addition to the generic local evidence (git SHA, systemd status, journal tail — see below), the
Hermes prompt for a `payment-order-drift`/`payment-order-drift-sensor` incident includes deterministic
domain evidence pulled only from data the check already received (no extra DB access, Hermes never
touches the DB): `drift_count`, and the oldest drifting order's `order_id`, `total`, and
`order_created_at`. On a `sensor_error` these are `n/a` — there is no drift data to report.

## Files

- `ai-ops/watchdog/watchdog.js` — the check runner (Node, ESM, no dependencies beyond the runtime).
- `ai-ops/watchdog/ops/kitchen-watchdog.service` — systemd **user** oneshot unit.
- `ai-ops/watchdog/ops/kitchen-watchdog.timer` — systemd **user** timer, fires the service every 5
  minutes.
- `api/kitchen-ops/payment-order-drift.js`, `api/_lib/paymentOrderDriftSensor.js` — the sensor endpoint
  and its query logic (Vercel-side, service-role key).
- `tests/unit/kitchen-watchdog.test.mjs` — unit tests for the 3 HTTP-status checks (mocked `fetch`, no
  network/DB access).
- `tests/unit/payment-order-drift-sensor.test.mjs` — unit tests for the sensor and its 2-episode state
  machine integration (mocked Supabase client and `fetch`, no network/DB access).

## Target VPS contract

This install runs entirely as the `eros` **user**, under user systemd — no root, no `sudo`, no
`/etc/systemd/system`:

| Item | Value |
|---|---|
| VPS user | `eros` |
| Repo path (dedicated worktree) | `/home/eros/projects/walbox-watchdog` |
| Node binary | `/home/eros/.local/bin/node` |
| User systemd unit dir | `/home/eros/.config/systemd/user/` |
| Linger | `yes` (user units keep running after logout/without an active session) |
| Env file | `/home/eros/.config/walbox/kitchen-watchdog.env` |

This install uses a dedicated git worktree at `/home/eros/projects/walbox-watchdog` (not the main
`/home/eros/projects/walbox` checkout) — `WorkingDirectory` in `kitchen-watchdog.service` points there,
and all `cp`/`node` commands below assume you're running them from inside that worktree. Adjust the
paths in `kitchen-watchdog.service` if any of the above differs on the actual box.

## Configuration — env var (no secrets in the repo)

The service reads its configuration from an `EnvironmentFile`, **not** from anything committed to
this repo:

```
/home/eros/.config/walbox/kitchen-watchdog.env
```

Create it manually on the VPS (as `eros`, no `sudo` needed — it's a user-owned path):

```bash
mkdir -p /home/eros/.config/walbox
cat > /home/eros/.config/walbox/kitchen-watchdog.env <<'EOF'
KITCHEN_WATCHDOG_BASE_URL=https://<your-production-domain>
# Required for the payment-order-drift check — must match KITCHEN_OPS_WATCHDOG_TOKEN on the Vercel
# project (see api/kitchen-ops/payment-order-drift.js). Not created/set by this task.
KITCHEN_OPS_WATCHDOG_TOKEN=<shared-server-to-server-token>
# Optional — omit both to only log alerts to stdout/stderr (captured by journald --user):
TELEGRAM_BOT_TOKEN=<telegram-bot-token>
TELEGRAM_CHAT_ID=<telegram-chat-id>
# Optional — only needed if the chat is a forum/topic chat and alerts should land in one topic:
TELEGRAM_MESSAGE_THREAD_ID=<telegram-message-thread-id>
EOF
chmod 600 /home/eros/.config/walbox/kitchen-watchdog.env
```

Canonical env var name — use exactly this one, no aliases:

| Variable | Required | Purpose |
|---|---|---|
| `KITCHEN_WATCHDOG_BASE_URL` | yes | Base URL of the deployed app (no trailing slash needed) |
| `KITCHEN_OPS_WATCHDOG_TOKEN` | yes (for the `payment-order-drift` check) | Bearer token sent to `/api/kitchen-ops/payment-order-drift`; must match the same-named env var on Vercel |
| `WATCHDOG_STATE_FILE` | no | Overrides where consecutive-failure counters are persisted (default: `ai-ops/watchdog/.watchdog-state.json` next to the script) |
| `TELEGRAM_BOT_TOKEN` | no | If set together with `TELEGRAM_CHAT_ID`, alerts are sent via Telegram |
| `TELEGRAM_CHAT_ID` | no | Telegram chat/user id to send alerts to |
| `TELEGRAM_MESSAGE_THREAD_ID` | no | If set, alerts are sent into this forum topic/thread within the chat (`message_thread_id`); if unset, behavior is unchanged (message sent to the chat's default thread) |
| `HERMES_ENABLED` | no | `true` to enable Incident Auto-Diagnosis V1 (see below); default is disabled, V1 behavior unchanged |
| `HERMES_PYTHON_PATH` | no | Python interpreter used to invoke Hermes, default `python3` — not tied to any specific VPS layout |
| `HERMES_TIMEOUT_MS` | no | Hard kill timeout (ms) for the Hermes one-shot process, default `60000` |
| `HERMES_OPS_THREAD_ID` | no | Telegram forum topic/thread id ("HERMES OPS") where the diagnosis is posted — separate from `TELEGRAM_MESSAGE_THREAD_ID` |
| `EVIDENCE_TIMEOUT_MS` | no | Hard kill timeout (ms) for EACH local evidence command (`git`, `systemctl`, `journalctl`), default `5000` |

Never commit `kitchen-watchdog.env` or any real token/URL to the repo.

## Incident Auto-Diagnosis V1 (`ai-ops/watchdog/incident-bridge.js`)

Optional, gated by `HERMES_ENABLED=true`. Evidence-first pattern: Hermes never investigates live —
it only ever analyzes a static evidence block the Watchdog already collected. This is a deliberate
fix over an earlier version where Hermes reached the "HERMES OPS" thread but then timed out at 60s
on the real VPS, because it was left to explore/act rather than being handed the facts up front.
Raising the timeout would have hidden the symptom, not the cause, so V1 keeps `HERMES_TIMEOUT_MS`
at its existing default and instead removes the need for Hermes to do any investigation itself.

Flow, on a new alert episode (threshold just crossed, same place `toAlert` is populated — not on
every failing run):

1. Existing Telegram alert is sent; state is already persisted at this point.
2. **Evidence collection** (`collectEvidence`, local only, no network calls): check/result, target,
   timestamp, the runtime git SHA (`git rev-parse HEAD` in the service's `WorkingDirectory`),
   `systemctl --user status kitchen-watchdog.service`, and the last ~30 lines of
   `journalctl --user -u kitchen-watchdog.service`. Each command runs with its own
   `EVIDENCE_TIMEOUT_MS` timeout and is isolated from the others — a missing or hanging command
   reports as "non disponibile" instead of blocking evidence collection or the Watchdog run. Raw
   output is best-effort redacted (Telegram-bot-token-shaped strings, `Authorization:` header
   values) before it is used anywhere.
3. The evidence is embedded as static text in the Hermes prompt (`buildHermesPrompt`), which
   explicitly instructs Hermes to analyze **only** that evidence — no tool calls, no commands, no
   remediation.
4. Hermes is invoked one-shot and read-only (`<HERMES_PYTHON_PATH> -m hermes_cli.main --safe-mode -z
   <prompt>`, no shell) → the compact diagnosis (causa probabile, evidence, impatto, next safe
   check, escalation) is posted to the same Telegram `chat_id`, on the `HERMES_OPS_THREAD_ID` topic.

Hard constraints: zero n8n/DB/Claude/deploy calls, zero automated remediation, Hermes path/runtime
configurable via env only, no secrets in evidence by design. A failure at either step (evidence
collection or Hermes itself) never breaks the Watchdog run — it is caught and reported as a
failed-diagnosis message, and cannot cause a duplicate alert on the next run because the episode
state is saved before evidence collection and Hermes run.

## Install (systemd — user units, no sudo)

Run as `eros` on the VPS:

```bash
mkdir -p /home/eros/.config/systemd/user/
cp ai-ops/watchdog/ops/kitchen-watchdog.service /home/eros/.config/systemd/user/kitchen-watchdog.service
cp ai-ops/watchdog/ops/kitchen-watchdog.timer /home/eros/.config/systemd/user/kitchen-watchdog.timer

systemctl --user daemon-reload
systemctl --user enable --now kitchen-watchdog.timer
```

Linger is already enabled for `eros` (`loginctl show-user eros` → `Linger=yes`), so the user timer
keeps firing even with no active login session — no extra step needed for that.

Check status / logs (no `sudo`, all `--user`):

```bash
systemctl --user status kitchen-watchdog.timer
systemctl --user list-timers kitchen-watchdog.timer
journalctl --user -u kitchen-watchdog.service -n 50 --no-pager
```

Run one check manually (does not require the timer to be installed):

```bash
KITCHEN_WATCHDOG_BASE_URL=https://<your-production-domain> /home/eros/.local/bin/node ai-ops/watchdog/watchdog.js
```

Exit code is `0` if all checks passed, `1` if any check failed, `2` on an unexpected/fatal error.

## Uninstall

```bash
systemctl --user disable --now kitchen-watchdog.timer
rm /home/eros/.config/systemd/user/kitchen-watchdog.service /home/eros/.config/systemd/user/kitchen-watchdog.timer
systemctl --user daemon-reload
```

## Tests

```bash
node --test tests/unit/kitchen-watchdog.test.mjs
node --test tests/unit/payment-order-drift-sensor.test.mjs
```

These tests mock `fetch` and redirect state-file I/O to a temp directory — no network calls, no DB
access, nothing written outside `os.tmpdir()`.
