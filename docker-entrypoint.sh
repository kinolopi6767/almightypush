#!/bin/sh
# Runs as container root (PID 1) ONLY to perform the one-time ownership repair
# below, then drops to the unprivileged `app` user for everything else via
# su-exec (exec-preserving, so signals still reach the real processes).
# See Dockerfile: the image stays least-privilege at runtime — root is used
# for this pre-flight alone, never for the web server or the worker.
set -e

# Docker injects HOSTNAME=<container-id>, which makes Next.js standalone bind to
# the container IP instead of 0.0.0.0 → loopback healthchecks fail. Force it.
export HOSTNAME=0.0.0.0

# One-time healing for data volumes created by pre-non-root images: those
# files are root-owned, so the `app` user fails the writetest and the old
# start.sh died FATAL (breaking Coolify rolling updates with a rollback
# loop). Repair automatically, but ONLY when the app user genuinely cannot
# write — when ownership is already correct this is a single touch, not a
# recursive chown over a multi-GB database on every container start.
if ! su-exec app touch /app/data/.writetest 2>/dev/null; then
  echo "INFO: /app/data is not writable by app (legacy root-owned volume?) — repairing ownership once (chown -R app:app /app/data)..." >&2
  chown -R app:app /app/data
  chmod 755 /app/data
  if ! su-exec app touch /app/data/.writetest 2>/dev/null; then
    echo "FATAL: /app/data is still not writable by app after ownership repair — check the volume mount (read-only? wrong driver?)" >&2
    exit 1
  fi
fi
rm -f /app/data/.writetest

# Drop privileges permanently and run the real command (start.sh by default).
exec su-exec app "$@"
