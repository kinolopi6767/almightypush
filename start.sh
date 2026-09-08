#!/bin/sh
# Runs worker (background, auto-restart) + web (foreground) from one container.
set -e

# Docker injects HOSTNAME=<container-id>, which makes Next.js standalone bind to
# the container IP instead of 0.0.0.0 → loopback healthchecks fail. Force it.
export HOSTNAME=0.0.0.0

# Fail fast on unwritable data dirs. In the Docker image the entrypoint
# (docker-entrypoint.sh, running as root pre-flight) already repaired
# legacy root-owned volumes, so reaching here unwritable means a genuinely
# broken mount (read-only volume, wrong driver) — die with a clear message
# instead of cryptic SQLITE_CANTOPEN errors from both processes later.
if ! touch /app/data/.writetest 2>/dev/null; then
  echo "FATAL: /app/data is not writable by $(id -u 2>/dev/null || echo unknown) — the volume mount is broken (read-only?); ownership repair already ran in the entrypoint" >&2
  exit 1
fi
rm -f /app/data/.writetest

WORKER_PID=""
SHUTTING_DOWN=0

# `exec` replaces this shell, so without a trap SIGTERM/SIGINT go only to the
# web server — the background worker is orphaned and killed mid-send without
# its graceful-shutdown path (claimed rows then sit `sending` until the
# stale-claim window expires). Forward signals to the worker first, then exit
# so the orchestrator's SIGTERM to PID 1 still stops the container.
forward_signal() {
  if [ "$SHUTTING_DOWN" -eq 0 ]; then
    SHUTTING_DOWN=1
    if [ -n "$WORKER_PID" ]; then
      kill -TERM "$WORKER_PID" 2>/dev/null || true
      # Give the worker its grace window (35s internal cap) before we die.
      # The `exec`'d web server inherits this trap context via the shell that
      # stays as PID 1 until exec — after exec, the signal already forwarded
      # above is what matters.
      wait "$WORKER_PID" 2>/dev/null || true
    fi
  fi
  exit 143
}
trap 'forward_signal' TERM INT

# Restart the worker with linear backoff — a deterministic crash (bad env,
# missing file) must not become a hot restart loop pegging the CPU.
WORKER_RETRIES=0
WORKER_MAX_RETRIES=10
while true; do
  code=0
  node ./worker/index.cjs &
  WORKER_PID=$!
  wait "$WORKER_PID" || code=$?
  WORKER_PID=""
  # A signal-driven shutdown must not be mistaken for a crash loop.
  if [ "$SHUTTING_DOWN" -eq 1 ]; then
    exit 143
  fi
  echo "worker exited ($code), restarting..."
  WORKER_RETRIES=$((WORKER_RETRIES + 1))
  if [ "$WORKER_RETRIES" -gt "$WORKER_MAX_RETRIES" ]; then
    # Fail the CONTAINER, not just the background job: if the supervisor only
    # `exit 1`s here, the background loop dies while the web server keeps
    # running — the panel looks healthy while every send/schedule/automation
    # silently stalls (no deliveries, no heartbeats, no alerts). Signalling the
    # parent (this script, blocked in `wait $WEB_PID`) runs the graceful
    # shutdown trap and exits non-zero so the orchestrator restarts us.
    echo "worker exceeded $WORKER_MAX_RETRIES restarts — stopping container so the orchestrator restarts it (running without a worker would silently stall all sends)" >&2
    kill -TERM "$PPID" 2>/dev/null || true
    exit 1
  fi
  delay=$((WORKER_RETRIES * 3))
  [ "$delay" -gt 30 ] && delay=30
  sleep "$delay"
done &
SUPERVISOR_PID=$!

# Web runs in the foreground; when it exits, shut the worker down too instead
# of leaving it orphaned.
node ./apps/web/server.js &
WEB_PID=$!
# Guard the wait so `set -e` doesn't skip worker cleanup on a web crash.
WEB_CODE=0
wait "$WEB_PID" || WEB_CODE=$?
SHUTTING_DOWN=1
if [ -n "$WORKER_PID" ]; then
  kill -TERM "$WORKER_PID" 2>/dev/null || true
fi
kill "$SUPERVISOR_PID" 2>/dev/null || true
exit "$WEB_CODE"
