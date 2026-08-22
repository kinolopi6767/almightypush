#!/bin/sh
# Runs worker (background, auto-restart) + web (foreground) from one container.
set -e

# Docker injects HOSTNAME=<container-id>, which makes Next.js standalone bind to
# the container IP instead of 0.0.0.0 → loopback healthchecks fail. Force it.
export HOSTNAME=0.0.0.0

while true; do
  node ./worker/index.cjs
  echo "worker exited ($?), restarting in 3s..."
  sleep 3
done &

exec node ./apps/web/server.js