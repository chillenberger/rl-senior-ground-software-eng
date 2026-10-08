import { z } from 'zod'
import Database from 'better-sqlite3'
import { SqliteDatabase } from './database'

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
  altitude: 'altitude',
  velocity: 'velocity',
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
    query += ` ORDER BY ${orderColumnByName[parsed.orderBy]} ${direction}, id ASC`
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

const SatelliteWithLatestReadingDBSchema = z.object({
  id: z.string(),
  operator: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  telemetry_id: z.number().nullable(),
  timestamp: z.string().nullable(),
  altitude: z.number().nullable(),
  velocity: z.number().nullable(),
  health_status: HealthStatusSchema.nullable(),
})

export const LatestReadingSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  altitude: z.number(),
  velocity: z.number(),
  status: HealthStatusSchema,
})

export const SatelliteSummarySchema = z.object({
  id: z.string(),
  operator: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  latestReading: LatestReadingSchema.nullable(),
})

export type SatelliteSummary = z.infer<typeof SatelliteSummarySchema>

/*
The latest reading is the telemetry row with the newest timestamp.
A satellite with no readings has latestReading null.
*/
export function listSatellites (db: SqliteDatabase): SatelliteSummary[] {
  const rows = db.prepare(`
    SELECT
      satellites.id AS id,
      satellites.operator AS operator,
      satellites.created_at AS created_at,
      satellites.updated_at AS updated_at,
      latest.id AS telemetry_id,
      latest.timestamp AS timestamp,
      latest.altitude AS altitude,
      latest.velocity AS velocity,
      latest.health_status AS health_status
    FROM satellites
    LEFT JOIN telemetry AS latest
      ON latest.id = (
        SELECT telemetry.id
        FROM telemetry
        WHERE telemetry.satellite_id = satellites.id
        ORDER BY telemetry.timestamp DESC, telemetry.id DESC
        LIMIT 1
      )
    ORDER BY satellites.id ASC
  `).all().map(row => SatelliteWithLatestReadingDBSchema.parse(row))

  return rows.map((row) => {
    const summary = {
      id: row.id,
      operator: row.operator,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      latestReading: row.telemetry_id === null ? null : {
        id: row.telemetry_id.toString(),
        timestamp: row.timestamp,
        altitude: row.altitude,
        velocity: row.velocity,
        status: row.health_status,
      },
    }
    return SatelliteSummarySchema.parse(summary)
  })
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
      satellite_id, timestamp, altitude, velocity, health_status
    ) VALUES (?, ?, ?, ?, ?)
    RETURNING *
  `)

  try {
    const row = insert.get(parsed.satelliteId, parsed.timestamp, parsed.altitude, parsed.velocity, parsed.status)
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
