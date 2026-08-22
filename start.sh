#!/bin/sh
# Runs worker (background, auto-restart) + web (foreground) from one container.
set -e

while true; do
  node ./worker/index.cjs
  echo "worker exited ($?), restarting in 3s..."
  sleep 3
done &

exec node ./apps/web/server.js