#!/bin/sh
# Runs worker (background, auto-restart) + web (foreground) from one container.
set -e

# Docker injects HOSTNAME=<container-id>, which makes Next.js standalone bind to
# the container IP instead of 0.0.0.0 → loopback healthchecks fail. Force it.
export HOSTNAME=0.0.0.0

# Restart the worker with linear backoff — a deterministic crash (bad env,
# missing file) must not become a hot restart loop pegging the CPU.
WORKER_RETRIES=0
WORKER_MAX_RETRIES=10
while true; do
  code=0
  node ./worker/index.cjs || code=$?
  echo "worker exited ($code), restarting..."
  WORKER_RETRIES=$((WORKER_RETRIES + 1))
  if [ "$WORKER_RETRIES" -gt "$WORKER_MAX_RETRIES" ]; then
    echo "worker exceeded $WORKER_MAX_RETRIES restarts — giving up"
    exit 1
  fi
  delay=$((WORKER_RETRIES * 3))
  [ "$delay" -gt 30 ] && delay=30
  sleep "$delay"
done &

exec node ./apps/web/server.js
