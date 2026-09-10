#!/bin/sh
# Runs worker (supervised in the background) + web (background, waited on)
# from one container. PID 1 stays this shell so TERM/INT are trapped and
# forwarded to BOTH processes (the previous version spawned the worker
# supervisor in a subshell, so the parent's $WORKER_PID stayed empty and
# shutdown never reached the worker — in-flight sends were SIGKILLed).
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

WORKER_PID_FILE="${TMPDIR:-/tmp}/pushpanel-worker.pid"
WEB_PID=""
SUPERVISOR_PID=""
SHUTTING_DOWN=0

# Terminate the currently-running worker (if any) and wait for its own
# graceful-shutdown path to finish (bounded: the worker caps itself at
# WORKER_GRACE_EXIT_MS).
stop_worker() {
  if [ -s "$WORKER_PID_FILE" ]; then
    WPID=$(cat "$WORKER_PID_FILE" 2>/dev/null || true)
    if [ -n "$WPID" ]; then
      kill -TERM "$WPID" 2>/dev/null || true
      wait "$WPID" 2>/dev/null || true
    fi
  fi
}

shutdown() {
  if [ "$SHUTTING_DOWN" -eq 0 ]; then
    SHUTTING_DOWN=1
    # Worker first (it has queued claims to finish), then the supervisor so it
    # cannot restart it, then web.
    stop_worker
    if [ -n "$SUPERVISOR_PID" ]; then
      kill -TERM "$SUPERVISOR_PID" 2>/dev/null || true
    fi
    if [ -n "$WEB_PID" ]; then
      kill -TERM "$WEB_PID" 2>/dev/null || true
      wait "$WEB_PID" 2>/dev/null || true
    fi
  fi
  exit 143
}
trap shutdown TERM INT

# Restart the worker with linear backoff — a deterministic crash (bad env,
# missing file) must not become a hot restart loop pegging the CPU. The PID is
# published to a file because a background subshell's variables are invisible
# to this shell.
(
  # A TERM to the supervisor must take its current child down with it and stop
  # the restart loop (the parent also stops the worker via the PID file; this
  # covers the kill-supervisor-first path).
  trap 'kill -TERM "${child:-}" 2>/dev/null || true; exit 0' TERM INT
  retries=0
  while true; do
    node ./worker/index.cjs &
    child=$!
    echo "$child" > "$WORKER_PID_FILE"
    code=0
    wait "$child" || code=$?
    rm -f "$WORKER_PID_FILE"
    echo "worker exited ($code), restarting..."
    retries=$((retries + 1))
    if [ "$retries" -gt 10 ]; then
      # Fail the CONTAINER: if only this background job exits, the web server
      # keeps serving while every send/schedule/automation silently stalls.
      # Signalling the parent runs the graceful shutdown trap and exits
      # non-zero so the orchestrator restarts us.
      echo "worker exceeded 10 restarts — stopping container so the orchestrator restarts it (running without a worker would silently stall all sends)" >&2
      kill -TERM "$PPID" 2>/dev/null || true
      exit 1
    fi
    delay=$((retries * 3))
    [ "$delay" -gt 30 ] && delay=30
    sleep "$delay"
  done
) &
SUPERVISOR_PID=$!

# Web runs in the background so this shell (PID 1) stays alive to trap signals.
node ./apps/web/server.js &
WEB_PID=$!

# Guard the wait so `set -e` doesn't skip worker cleanup on a web crash.
WEB_CODE=0
wait "$WEB_PID" || WEB_CODE=$?
SHUTTING_DOWN=1
# Web exited on its own (crash or orchestrator stop): clean the worker up too
# instead of leaving it orphaned.
stop_worker
kill -TERM "$SUPERVISOR_PID" 2>/dev/null || true
exit "$WEB_CODE"
