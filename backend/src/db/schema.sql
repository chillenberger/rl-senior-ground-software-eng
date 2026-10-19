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

-- Derived telemetry parameter data
CREATE TABLE IF NOT EXISTS telemetry_parameters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  satellite_id TEXT NOT NULL REFERENCES satellites(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  derived BOOLEAN NOT NULL DEFAULT FALSE,
  definition TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deprecated_at TEXT DEFAULT NULL,
  metadata TEXT DEFAULT NULL,
  UNIQUE (satellite_id, name, deprecated_at),
  CHECK (derived = FALSE OR definition ->> 'equation' IS NOT NULL),
  CHECK (metadata IS NULL OR json_type(metadata) = 'object')
);

-- measurement is JSON so new fields can land without a migration.
-- parameter_id records which parameter definition produced the reading.
-- Table UNIQUE constraints cannot contain expressions, so the
-- (satellite, timestamp, measurement name) key is a unique index.
CREATE TABLE IF NOT EXISTS telemetry(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  satellite_id TEXT NOT NULL REFERENCES satellites(id) ON DELETE RESTRICT,
  parameter_id INTEGER NOT NULL REFERENCES telemetry_parameters(id) ON DELETE RESTRICT,
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

INSERT OR IGNORE INTO telemetry_parameters (
  id,
  satellite_id,
  name,
  derived,
  definition,
  metadata
) VALUES
  (
    1,
    'PHOTON-01',
    'voltage',
    FALSE,
    '{"units": "v", "check": "voltage >= 0", "spec": "voltage > 5 and voltage < 12"}',
    '{"revision": 1, "description": "Voltage reading from the battery"}'
  ),
  (
    2,
    'PHOTON-01',
    'current',
    FALSE,
    '{"units": "a", "check": "current >= 0", "spec": "current > 0 and current < 10"}',
    '{"revision": 1, "description": "Current reading from the battery"}'
  ),
  (
    3,
    'PHOTON-01',
    'health_status',
    FALSE,
    '{"check": "health_status == \"healthy\" or health_status == \"anomaly\" or health_status == \"critical\"", "spec": "health_status == \"healthy\""}',
    '{"revision": 1, "description": "Health status of solar array"}'
  ),
  (
    4,
    'PHOTON-01',
    'altitude',
    FALSE,
    '{"units": "m", "check": "altitude >= 0", "spec": "altitude > 0"}',
    '{"revision": 1}'
  ),
  (
    5,
    'PHOTON-01',
    'velocity',
    FALSE,
    '{"units": "m/s", "check": "velocity >= 0", "spec": "velocity > 0"}',
    '{"revision": 1}'
  ),
  (
    6,
    'PHOTON-01',
    'power',
    TRUE,
    '{"equation": "voltage * current", "units": "w", "check": "power >= 0", "spec": "power < 1.5"}',
    '{"revision": 1, "description": "Power reading from the battery"}'
  ),
  (
    7,
    'AURORA-3',
    'health_status',
    FALSE,
    '{"check": "health_status == \"healthy\" or health_status == \"anomaly\" or health_status == \"critical\"", "spec": "health_status == \"healthy\""}',
    '{"revision": 1, "description": "Health status of propulsion system"}'
  ),
  (
    8,
    'AURORA-3',
    'altitude',
    FALSE,
    '{"units": "m", "check": "altitude >= 0", "spec": "altitude > 0"}',
    '{"revision": 1}'
  ),
  (
    9,
    'AURORA-3',
    'velocity',
    FALSE,
    '{"units": "m/s", "check": "velocity >= 0", "spec": "velocity > 0"}',
    '{"revision": 1}'
  ),
  (
    10,
    'AURORA-3',
    'power',
    TRUE,
    '{"equation": "voltage * current", "units": "w", "check": "power >= 0", "spec": "power < 1.5"}',
    '{"revision": 1, "description": "Power reading from the propulsion system"}'
  ),
  (
    11,
    'HARBOR-7',
    'altitude',
    FALSE,
    '{"units": "m", "check": "altitude >= 0", "spec": "altitude > 0"}',
    '{"revision": 1}'
  ),
  (
    12,
    'HARBOR-7',
    'velocity',
    FALSE,
    '{"units": "m/s", "check": "velocity >= 0", "spec": "velocity > 0"}',
    '{"revision": 1}'
  ),
  (
    13,
    'HARBOR-7',
    'power',
    TRUE,
    '{"equation": "voltage * current", "units": "w", "check": "power >= 0", "spec": "power < 1.5"}',
    '{"revision": 1, "description": "Power reading from the imaging system"}'
  );

INSERT OR IGNORE INTO telemetry(
  satellite_id,
  parameter_id,
  timestamp,
  measurement
) VALUES
  ('PHOTON-01', 1, '2026-09-25T00:00:00.000Z', '{"value": 11.2, "units": "v", "name": "voltage", "oos": false}'),
  ('PHOTON-01', 1, '2026-09-25T06:00:00.000Z', '{"value": 8.1, "units": "v", "name": "voltage", "oos": false}'),
  ('PHOTON-01', 1, '2026-09-25T12:00:00.000Z', '{"value": 4.8, "units": "v", "name": "voltage", "oos": true}'),
  ('PHOTON-01', 1, '2026-09-25T18:00:00.000Z', '{"value": 4, "units": "v", "name": "voltage", "oos": true}'),
  ('PHOTON-01', 2, '2026-09-24T23:00:00.000Z', '{"value": 1.4, "units": "a", "name": "current", "oos": false}'),
  ('PHOTON-01', 2, '2026-09-25T05:00:00.000Z', '{"value": 3.8, "units": "a", "name": "current", "oos": false}'),
  ('PHOTON-01', 2, '2026-09-25T11:00:00.000Z', '{"value": 10.4, "units": "a", "name": "current", "oos": true}'),
  ('PHOTON-01', 2, '2026-09-25T17:00:00.000Z', '{"value": 7, "units": "a", "name": "current", "oos": false}'),
  ('PHOTON-01', 4, '2026-09-25T00:00:00.000Z', '{"value": 420, "units": "m", "name": "altitude", "oos": false}'),
  ('PHOTON-01', 4, '2026-09-25T06:00:00.000Z', '{"value": 310, "units": "m", "name": "altitude", "oos": false}'),
  ('PHOTON-01', 4, '2026-09-25T12:00:00.000Z', '{"value": 180, "units": "m", "name": "altitude", "oos": false}'),
  ('PHOTON-01', 4, '2026-09-25T18:00:00.000Z', '{"value": 100, "units": "m", "name": "altitude", "oos": false}'),
  ('PHOTON-01', 5, '2026-09-25T00:00:00.000Z', '{"value": 7.2, "units": "m/s", "name": "velocity", "oos": false}'),
  ('PHOTON-01', 5, '2026-09-25T06:00:00.000Z', '{"value": 8.1, "units": "m/s", "name": "velocity", "oos": false}'),
  ('PHOTON-01', 5, '2026-09-25T12:00:00.000Z', '{"value": 9.4, "units": "m/s", "name": "velocity", "oos": false}'),
  ('PHOTON-01', 5, '2026-09-25T18:00:00.000Z', '{"value": 10, "units": "m/s", "name": "velocity", "oos": false}'),
  ('AURORA-3', 7, '2026-09-24T16:20:00.000Z', '{"value": "healthy", "name": "health_status", "oos": false}'),
  ('AURORA-3', 7, '2026-09-25T04:20:00.000Z', '{"value": "anomaly", "name": "health_status", "oos": true}'),
  ('AURORA-3', 7, '2026-09-25T10:20:00.000Z', '{"value": "critical", "name": "health_status", "oos": true}'),
  ('AURORA-3', 7, '2026-09-25T16:20:00.000Z', '{"value": "healthy", "name": "health_status", "oos": false}'),
  ('AURORA-3', 8, '2026-09-25T00:00:00.000Z', '{"value": 520, "units": "m", "name": "altitude", "oos": false}'),
  ('AURORA-3', 8, '2026-09-25T06:00:00.000Z', '{"value": 360, "units": "m", "name": "altitude", "oos": false}'),
  ('AURORA-3', 8, '2026-09-25T12:00:00.000Z', '{"value": 210, "units": "m", "name": "altitude", "oos": false}'),
  ('AURORA-3', 8, '2026-09-25T18:00:00.000Z', '{"value": 100, "units": "m", "name": "altitude", "oos": false}'),
  ('AURORA-3', 9, '2026-09-25T00:00:00.000Z', '{"value": 6.5, "units": "m/s", "name": "velocity", "oos": false}'),
  ('AURORA-3', 9, '2026-09-25T06:00:00.000Z', '{"value": 7.4, "units": "m/s", "name": "velocity", "oos": false}'),
  ('AURORA-3', 9, '2026-09-25T12:00:00.000Z', '{"value": 8.8, "units": "m/s", "name": "velocity", "oos": false}'),
  ('AURORA-3', 9, '2026-09-25T18:00:00.000Z', '{"value": 10, "units": "m/s", "name": "velocity", "oos": false}'),
  ('AURORA-3', 10, '2026-09-25T00:00:00.000Z', '{"value": 420, "units": "w", "name": "power", "oos": false}'),
  ('AURORA-3', 10, '2026-09-25T06:00:00.000Z', '{"value": 640, "units": "w", "name": "power", "oos": false}'),
  ('AURORA-3', 10, '2026-09-25T12:00:00.000Z', '{"value": 880, "units": "w", "name": "power", "oos": false}'),
  ('AURORA-3', 10, '2026-09-25T18:00:00.000Z', '{"value": 1000, "units": "w", "name": "power", "oos": false}'),
  ('HARBOR-7', 11, '2026-09-25T00:00:00.000Z', '{"value": 390, "units": "m", "name": "altitude", "oos": false}'),
  ('HARBOR-7', 11, '2026-09-25T06:00:00.000Z', '{"value": 270, "units": "m", "name": "altitude", "oos": false}'),
  ('HARBOR-7', 11, '2026-09-25T12:00:00.000Z', '{"value": 150, "units": "m", "name": "altitude", "oos": false}'),
  ('HARBOR-7', 11, '2026-09-25T18:00:00.000Z', '{"value": 100, "units": "m", "name": "altitude", "oos": false}'),
  ('HARBOR-7', 12, '2026-09-25T00:00:00.000Z', '{"value": 6.8, "units": "m/s", "name": "velocity", "oos": false}'),
  ('HARBOR-7', 12, '2026-09-25T06:00:00.000Z', '{"value": 7.9, "units": "m/s", "name": "velocity", "oos": false}'),
  ('HARBOR-7', 12, '2026-09-25T12:00:00.000Z', '{"value": 9.1, "units": "m/s", "name": "velocity", "oos": false}'),
  ('HARBOR-7', 12, '2026-09-25T18:00:00.000Z', '{"value": 10, "units": "m/s", "name": "velocity", "oos": false}'),
  ('HARBOR-7', 13, '2026-09-25T00:00:00.000Z', '{"value": 510, "units": "w", "name": "power", "oos": false}'),
  ('HARBOR-7', 13, '2026-09-25T06:00:00.000Z', '{"value": 670, "units": "w", "name": "power", "oos": false}'),
  ('HARBOR-7', 13, '2026-09-25T12:00:00.000Z', '{"value": 840, "units": "w", "name": "power", "oos": false}'),
  ('HARBOR-7', 13, '2026-09-25T18:00:00.000Z', '{"value": 1000, "units": "w", "name": "power", "oos": false}');
