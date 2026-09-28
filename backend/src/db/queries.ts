import { z } from 'zod'
import { SqliteDatabase } from './database'

import Database from 'better-sqlite3'


export const SatelliteRecordSchema = z.object({
  id: z.string(),
  operator: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type SatelliteRecord = z.infer<typeof SatelliteRecordSchema>

export const HealthStatusSchema = z.enum(['healthy', 'anomaly', 'critical'])
export const OrderDirectionSchema = z.enum(['asc', 'desc'])
export type HealthStatus = z.infer<typeof HealthStatusSchema>

/*
SQLite schema for the telemetry table.
SQLite is case insensitive, so we use the snake_case column names.
*/
export const TelemetryRecordDBSchema = z.object({
  id: z.number(),
  satellite_id: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  timestamp: z.string(),
  altitude: z.number(),
  velocity: z.number(),
  health_status: HealthStatusSchema,
  created_at: z.string(),
})

/* 
Efficient snake_case to camelCase transformation.  
*/
export const TelemetryRecordSchema = TelemetryRecordDBSchema.transform((record) => ({
  id: record.id.toString(),
  satelliteId: record.satellite_id,
  latitude: record.latitude,
  longitude: record.longitude,
  timestamp: record.timestamp,
  altitude: record.altitude,
  velocity: record.velocity,
  status: record.health_status,
  createdAt: record.created_at,
}))
export type TelemetryRecord = z.infer<typeof TelemetryRecordSchema>

const orderColumnByName = {
  satelliteId: 'satellite_id',
  status: 'health_status',
  createdAt: 'created_at',
  timestamp: 'timestamp',
} as const

export const OrderTelemetryColumnsSchema = z.enum(
  Object.keys(orderColumnByName) as [keyof typeof orderColumnByName, ...(keyof typeof orderColumnByName)[]],
)

export const GetTelemetryRecordsOptionsSchema = z.object({
  id: z.string().optional(),
  limit: z.coerce.number().int().nonnegative().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  orderBy: OrderTelemetryColumnsSchema.optional(),
  orderDirection: OrderDirectionSchema.optional(),
  satelliteId: z.string().optional(),
  status: HealthStatusSchema.optional()
})

export type GetTelemetryRecordsOptions = z.output<typeof GetTelemetryRecordsOptionsSchema>

function appendEquals (
  clauses: string[],
  params: Array<string | number>,
  column: string,
  value: string | number | undefined,
): void {
  if (value === undefined) return
  clauses.push(`${column} = ?`)
  params.push(value)
}

export function getTelemetryRecords (
  db: SqliteDatabase,
  options: GetTelemetryRecordsOptions = {},
): z.output<typeof TelemetryRecordSchema>[] {
  const parsed = GetTelemetryRecordsOptionsSchema.parse(options)
  const clauses: string[] = []
  const params: Array<string | number> = []

  appendEquals(clauses, params, 'id', parsed.id)
  appendEquals(clauses, params, 'satellite_id', parsed.satelliteId)
  appendEquals(clauses, params, 'health_status', parsed.status)

  let query = 'SELECT * FROM telemetry'
  if (clauses.length > 0) {
    query += ` WHERE ${clauses.join(' AND ')}`
  }

  if (parsed.orderBy !== undefined) {
    const direction = parsed.orderDirection === 'desc' ? 'DESC' : 'ASC'
    query += ` ORDER BY ${orderColumnByName[parsed.orderBy]} ${direction}`
  }

  if (parsed.limit !== undefined) {
    query += ' LIMIT ?'
    params.push(parsed.limit)
  } else if (parsed.offset !== undefined) {
    query += ' LIMIT -1'
  }

  if (parsed.offset !== undefined) {
    query += ' OFFSET ?'
    params.push(parsed.offset)
  }

  const rows = db.prepare(query).all(...params).map(row => TelemetryRecordDBSchema.parse(row))
  return TelemetryRecordSchema.array().parse(rows)
}

export function getTelemetryRecordById (
  db: SqliteDatabase,
  id: string,
): z.output<typeof TelemetryRecordSchema> {
  const row = db.prepare('SELECT * FROM telemetry WHERE id = ?').get(id)
  if (!row) throw new TelemetryRecordNotFoundError(id)
  return TelemetryRecordSchema.parse(row)
}

export const CreateTelemetryRecordRequestSchema = z.object({
  timestamp: z.iso.datetime({ offset: true}).transform((value) => new Date(value).toISOString()),
  satelliteId: z.string(),
  status: HealthStatusSchema,
  altitude: z.number().positive(),
  velocity: z.number().positive(),
  latitude: z.number().min(-90).max(90).nullable().optional().default(null),
  longitude: z.number().min(-180).max(180).nullable().optional().default(null),
})

export class TelemetryConflictError extends Error {
  constructor () {
    super('Telemetry record already exists for this satellite and timestamp with different values')
    this.name = 'TelemetryConflictError'
  }
}

export class UnknownSatelliteError extends Error {
  constructor (satelliteId: string) {
    super(`Satellite ${satelliteId} not found`)
    this.name = 'UnknownSatelliteError'
  }
}

export class TelemetryRecordNotFoundError extends Error {
  constructor (id: string) {
    super(`Telemetry record ${id} not found`)
    this.name = 'TelemetryRecordNotFoundError'
  }
}

function isSameTelemetryRecord (
  stored: z.output<typeof TelemetryRecordSchema>,
  record: z.input<typeof CreateTelemetryRecordRequestSchema>,
): boolean {
  return stored.altitude === record.altitude
    && stored.velocity === record.velocity
    && stored.status === record.status
    && stored.latitude === record.latitude
    && stored.longitude === record.longitude
}

/* 
Create a telemetry record.
If the record already exists with the same values, return the existing record.
If the record is different, throw a conflict error.
*/
export function createTelemetryRecord (
  db: SqliteDatabase,
  record: z.input<typeof CreateTelemetryRecordRequestSchema>,
): z.output<typeof TelemetryRecordSchema> {
  const parsed = CreateTelemetryRecordRequestSchema.parse(record)
  const insert = db.prepare(`
    INSERT INTO telemetry (
      satellite_id, latitude, longitude, timestamp, altitude, velocity, health_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `)

  try {
    const row = insert.get(parsed.satelliteId, parsed.latitude, parsed.longitude, parsed.timestamp, parsed.altitude, parsed.velocity, parsed.status)
    return TelemetryRecordSchema.parse(row)
  } catch (error) {
    if (((error instanceof Database.SqliteError) && error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY')) throw new UnknownSatelliteError(parsed.satelliteId)
    if (!((error instanceof Database.SqliteError) && error.code === 'SQLITE_CONSTRAINT_UNIQUE')) throw error

    const existing = db
      .prepare('SELECT * FROM telemetry WHERE satellite_id = ? AND timestamp = ?')
      .get(parsed.satelliteId, parsed.timestamp)
    const stored = TelemetryRecordSchema.safeParse(existing)
    if (!stored.success) throw error
    if (isSameTelemetryRecord(stored.data, parsed)) return stored.data

    throw new TelemetryConflictError()
  }
}

export function deleteTelemetryRecordById (
  db: SqliteDatabase,
  id: string,
): void {
  const row = db.prepare('DELETE FROM telemetry WHERE id = ?').run(id)
  if (row.changes === 0) throw new TelemetryRecordNotFoundError(id)
}
