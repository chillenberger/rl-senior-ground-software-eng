#!/bin/sh
# Seed a file-backed database on first boot, then start the API.
set -eu

db="${SQLITE_PATH:-/data/telemetry.sqlite}"

if [ "$db" != ":memory:" ] && [ ! -f "$db" ]; then
  echo "No database at $db; seeding sample telemetry."
  SQLITE_PATH="$db" bash /app/scripts/seed.sh
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

exec ./node_modules/.bin/fastify start \
  --address 0.0.0.0 \
  --port "${PORT:-3000}" \
  --log-level info \
  dist/app.js
