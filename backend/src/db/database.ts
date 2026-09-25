import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

export const DEFAULT_DATABASE_PATH = ':memory:'

export const SCHEMA = readFileSync(join(__dirname, 'schema.sql'), 'utf8')

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
