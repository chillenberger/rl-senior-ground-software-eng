#!/usr/bin/env bash
# Apply src/db/schema.sql and src/db/seed.sql to a SQLite file the API can reopen.
set -euo pipefail

cd "$(dirname "$0")/.."

db="${SQLITE_PATH:-data/telemetry.sqlite}"

if [[ "$db" == ":memory:" ]]; then
  echo "Refusing to seed :memory:. Unset SQLITE_PATH or point it at a file." >&2
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required. Install the SQLite command line tools and retry." >&2
  exit 1
fi

mkdir -p "$(dirname "$db")"

sqlite3 "$db" <<EOF
PRAGMA foreign_keys = ON;
.read src/db/schema.sql
.read src/db/seed.sql
EOF

echo "Seeded $db from src/db/seed.sql"
