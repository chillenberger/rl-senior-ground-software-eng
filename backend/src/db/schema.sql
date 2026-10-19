CREATE TABLE IF NOT EXISTS satellites (
  id TEXT PRIMARY KEY,
  operator TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TRIGGER IF NOT EXISTS satellites_set_updated_at
AFTER UPDATE ON satellites
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE satellites
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS telemetry_parameters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  satellite_id TEXT NOT NULL REFERENCES satellites(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  derived BOOLEAN NOT NULL DEFAULT FALSE,
  definition TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (satellite_id, name),
  CHECK (derived = FALSE OR definition ->> 'equation' IS NOT NULL)
);

-- measurement is JSON so new fields can land without a migration.
-- Table UNIQUE constraints cannot contain expressions, so the
-- (satellite, timestamp, measurement name) key is a unique index.
CREATE TABLE IF NOT EXISTS telemetry(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  satellite_id TEXT NOT NULL REFERENCES satellites(id) ON DELETE RESTRICT,
  timestamp TEXT NOT NULL,
  measurement BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telemetry_measurement
  ON telemetry (satellite_id, timestamp, measurement->>'name');

INSERT OR IGNORE INTO satellites (id, operator) VALUES
  ('PHOTON-01', 'Rocket Lab'),
  ('PHOTON-02', 'Rocket Lab'),
  ('AURORA-3', 'Aurora Space'),
  ('HARBOR-7', 'Harbor Imaging');

INSERT OR IGNORE INTO telemetry(
  satellite_id,
  timestamp,
  measurement
) VALUES
  ('PHOTON-01', '2026-09-25T18:00:00.000Z', '{"value": 4, "units": "v", "name": "voltage", "oos": true}'),
  ('PHOTON-01', '2026-09-25T17:00:00.000Z', '{"value": 7, "units": "a", "name": "current", "oos": false}'),
  ('PHOTON-01', '2026-09-25T18:00:00.000Z', '{"value": 100, "units": "m", "name": "altitude", "oos": false}'),
  ('PHOTON-01', '2026-09-25T18:00:00.000Z', '{"value": 10, "units": "m/s", "name": "velocity", "oos": false}'),
  ('AURORA-3', '2026-09-25T16:20:00.000Z', '{"value": "healthy", "name": "health_status", "oos": false}'),
  ('AURORA-3', '2026-09-25T18:00:00.000Z', '{"value": 100, "units": "m", "name": "altitude", "oos": false}'),
  ('AURORA-3', '2026-09-25T18:00:00.000Z', '{"value": 10, "units": "m/s", "name": "velocity", "oos": false}'),
  ('AURORA-3', '2026-09-25T18:00:00.000Z', '{"value": 1000, "units": "w", "name": "power", "oos": false}'),
  ('HARBOR-7', '2026-09-25T18:00:00.000Z', '{"value": 100, "units": "m", "name": "altitude", "oos": false}'),
  ('HARBOR-7', '2026-09-25T18:00:00.000Z', '{"value": 10, "units": "m/s", "name": "velocity", "oos": false}'),
  ('HARBOR-7', '2026-09-25T18:00:00.000Z', '{"value": 1000, "units": "w", "name": "power", "oos": false}');

INSERT OR IGNORE INTO telemetry_parameters (
  satellite_id,
  name,
  derived,
  definition
) VALUES
  (
    'PHOTON-01',
    'voltage',
    FALSE,
    '{"units": "v", "check": "voltage >= 0", "spec": "voltage > 5 and voltage < 12"}'
  ),
  (
    'PHOTON-01',
    'current',
    FALSE,
    '{"units": "a", "check": "current >= 0", "spec": "current > 0 and current < 10"}'
  ),
  (
    'PHOTON-01',
    'health_status',
    FALSE,
    '{"check": "health_status == \"healthy\" or health_status == \"anomaly\" or health_status == \"critical\"", "spec": "health_status == \"healthy\""}'
  ),
  (
    'PHOTON-01',
    'altitude',
    FALSE,
    '{"units": "m", "check": "altitude >= 0", "spec": "altitude > 0"}'
  ),
  (
    'PHOTON-01',
    'velocity',
    FALSE,
    '{"units": "m/s", "check": "velocity >= 0", "spec": "velocity > 0"}'
  ),
  (
    'PHOTON-01',
    'power',
    TRUE,
    '{"equation": "voltage * current", "units": "w", "check": "power >= 0", "spec": "power < 1.5"}'
  ),
  (
    'AURORA-3',
    'health_status',
    FALSE,
    '{"check": "health_status == \"healthy\" or health_status == \"anomaly\" or health_status == \"critical\"", "spec": "health_status == \"healthy\""}'
  ),
  (
    'AURORA-3',
    'altitude',
    FALSE,
    '{"units": "m", "check": "altitude >= 0", "spec": "altitude > 0"}'
  ),
  (
    'AURORA-3',
    'velocity',
    FALSE,
    '{"units": "m/s", "check": "velocity >= 0", "spec": "velocity > 0"}'
  ),
  (
    'AURORA-3',
    'power',
    TRUE,
    '{"equation": "voltage * current", "units": "w", "check": "power >= 0", "spec": "power < 1.5"}'
  );
