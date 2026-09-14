# Kitchen Watchdog V1 — Install

Synthetic HTTP-only monitor for the Kitchen SumUp Payment Hub. Checks 3 known endpoints every 5
minutes and alerts (Telegram, or stdout/stderr if Telegram is not configured) after **2 consecutive
failures of the same check**.

## Scope V1 (deliberate limits)

- HTTP only: no DB access, no n8n, no AI/LLM calls.
- 3 fixed checks, each with a fixed expected status:
  - `POST /api/kitchen-sumup-create-checkout` (empty body) → expected `400`
  - `GET /api/kitchen-sumup-reconcile-sweep` (no `Authorization`) → expected `401`
  - `POST /api/kitchen-sumup-webhook` (empty JSON body) → expected `200`
- Interval: 5 minutes, owned by the systemd **user** timer (the script itself runs once per
  invocation).
- Alert threshold: 2 consecutive failures of the *same* check (alerts once per failure episode, not
  on every failing run after that — a recovery resets the counter).

Anything beyond this (DB reconciliation checks, n8n orchestration, AI-based anomaly detection) is
out of scope for V1 and would need a separate, explicitly approved task.

## Files

- `ai-ops/watchdog/watchdog.js` — the check runner (Node, ESM, no dependencies beyond the runtime).
- `ai-ops/watchdog/ops/kitchen-watchdog.service` — systemd **user** oneshot unit.
- `ai-ops/watchdog/ops/kitchen-watchdog.timer` — systemd **user** timer, fires the service every 5
  minutes.
- `tests/unit/kitchen-watchdog.test.mjs` — unit tests (mocked `fetch`, no network/DB access).

## Target VPS contract

This install runs entirely as the `eros` **user**, under user systemd — no root, no `sudo`, no
`/etc/systemd/system`:

| Item | Value |
|---|---|
| VPS user | `eros` |
| Repo path | `/home/eros/projects/walbox` |
| Node binary | `/home/eros/.local/bin/node` |
| User systemd unit dir | `/home/eros/.config/systemd/user/` |
| Linger | `yes` (user units keep running after logout/without an active session) |
| Env file | `/home/eros/.config/walbox/kitchen-watchdog.env` |

Adjust the paths in `kitchen-watchdog.service` if any of the above differs on the actual box.

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
# Optional — omit both to only log alerts to stdout/stderr (captured by journald --user):
TELEGRAM_BOT_TOKEN=<telegram-bot-token>
TELEGRAM_CHAT_ID=<telegram-chat-id>
EOF
chmod 600 /home/eros/.config/walbox/kitchen-watchdog.env
```

Canonical env var name — use exactly this one, no aliases:

| Variable | Required | Purpose |
|---|---|---|
| `KITCHEN_WATCHDOG_BASE_URL` | yes | Base URL of the deployed app (no trailing slash needed) |
| `WATCHDOG_STATE_FILE` | no | Overrides where consecutive-failure counters are persisted (default: `ai-ops/watchdog/.watchdog-state.json` next to the script) |
| `TELEGRAM_BOT_TOKEN` | no | If set together with `TELEGRAM_CHAT_ID`, alerts are sent via Telegram |
| `TELEGRAM_CHAT_ID` | no | Telegram chat/user id to send alerts to |

Never commit `kitchen-watchdog.env` or any real token/URL to the repo.

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
```

These tests mock `fetch` and redirect state-file I/O to a temp directory — no network calls, no DB
access, nothing written outside `os.tmpdir()`.
