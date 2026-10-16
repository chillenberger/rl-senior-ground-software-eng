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

CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  satellite_id TEXT NOT NULL REFERENCES satellites(id) ON DELETE RESTRICT,
  timestamp TEXT NOT NULL,
  altitude REAL NOT NULL CHECK (altitude > 0),
  velocity REAL NOT NULL CHECK (velocity > 0),
  health_status TEXT NOT NULL CHECK (health_status IN ('healthy', 'anomaly', 'critical')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (satellite_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_health_status
  ON telemetry (health_status);

CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp
  ON telemetry (timestamp);

INSERT OR IGNORE INTO satellites (id, operator) VALUES
  ('PHOTON-01', 'Rocket Lab'),
  ('PHOTON-02', 'Rocket Lab'),
  ('AURORA-3', 'Aurora Space'),
  ('HARBOR-7', 'Harbor Imaging');

INSERT OR IGNORE INTO telemetry (
  satellite_id,
  timestamp,
  altitude,
  velocity,
  health_status
) VALUES
  ('PHOTON-01', '2026-09-25T16:00:00.000Z', 520000, 7.61, 'healthy'),
  ('PHOTON-01', '2026-09-25T16:30:00.000Z', 521400, 7.59, 'healthy'),
  ('PHOTON-01', '2026-09-25T17:00:00.000Z', 519800, 7.63, 'anomaly'),
  ('PHOTON-02', '2026-09-25T16:05:00.000Z', 610000, 7.55, 'healthy'),
  ('PHOTON-02', '2026-09-25T16:40:00.000Z', 608200, 7.56, 'healthy'),
  ('PHOTON-02', '2026-09-25T17:10:00.000Z', 607500, 7.54, 'critical'),
  ('AURORA-3', '2026-09-25T15:50:00.000Z', 780000, 7.46, 'healthy'),
  ('AURORA-3', '2026-09-25T16:20:00.000Z', 781100, 7.45, 'healthy'),
  ('AURORA-3', '2026-09-25T16:55:00.000Z', 779400, 7.47, 'anomaly'),
  ('HARBOR-7', '2026-09-25T16:12:00.000Z', 450000, 7.67, 'healthy'),
  ('HARBOR-7', '2026-09-25T16:48:00.000Z', 451200, 7.66, 'healthy'),
  ('HARBOR-7', '2026-09-25T17:18:00.000Z', 449600, 7.68, 'healthy');
