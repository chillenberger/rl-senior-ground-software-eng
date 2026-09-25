import Database from 'better-sqlite3'

export const DEFAULT_DATABASE_PATH = ':memory:'

export const SCHEMA = `
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
  latitude REAL CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude REAL CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
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
`

export type SatelliteRecord = {
  id: string
  operator: string
  created_at: string
  updated_at: string
}

export type HealthStatus = 'healthy' | 'anomaly' | 'critical'

export type TelemetryRecord = {
  id: number
  satellite_id: string
  latitude: number | null
  longitude: number | null
  timestamp: string
  altitude: number
  velocity: number
  health_status: HealthStatus
  created_at: string
}

export type SqliteDatabase = Database.Database

export function openDatabase (filename: string = DEFAULT_DATABASE_PATH): SqliteDatabase {
  const db = new Database(filename)
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}
