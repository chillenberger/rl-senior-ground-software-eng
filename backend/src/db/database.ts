import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { z } from 'zod'

export const DEFAULT_DATABASE_PATH = ':memory:'

export const SCHEMA = readFileSync(join(__dirname, 'schema.sql'), 'utf8')

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

export const TelemetryRecordSchema = z.object({
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

export type TelemetryRecord = z.infer<typeof TelemetryRecordSchema>

export type SqliteDatabase = Database.Database

export function openDatabase (filename: string = DEFAULT_DATABASE_PATH): SqliteDatabase {
  const db = new Database(filename)
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  return db
}

const orderColumnByName = {
  satelliteId: 'satellite_id',
  status: 'health_status',
  createdAt: 'created_at',
  timestamp: 'timestamp',
} as const

export const OrderTelemetryColumnsSchema = z.enum(
  Object.keys(orderColumnByName) as [keyof typeof orderColumnByName, ...(keyof typeof orderColumnByName)[]],
)

const OrderByColumnSchema = OrderTelemetryColumnsSchema.transform(
  (value) => orderColumnByName[value],
)

export const GetTelemetryRecordsOptionsSchema = z.object({
  id: z.string().optional(),
  limit: z.number().int().nonnegative().optional(),
  offset: z.number().int().nonnegative().optional(),
  orderBy: OrderByColumnSchema.optional(),
  orderDirection: OrderDirectionSchema.optional(),
  satelliteId: z.string().optional(),
  status: HealthStatusSchema.optional()
})

export type GetTelemetryRecordsOptions = z.input<typeof GetTelemetryRecordsOptionsSchema>

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

export function getTelemetryRecords (db: SqliteDatabase, options: GetTelemetryRecordsOptions = {}): TelemetryRecord[] {
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
    query += ` ORDER BY ${parsed.orderBy} ${direction}`
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

  return db.prepare(query).all(...params).map(row => TelemetryRecordSchema.parse(row))
}

export function getTelemetryRecordById (db: SqliteDatabase, id: string): TelemetryRecord | null{
  const row = db.prepare('SELECT * FROM telemetry WHERE id = ?').get(id)
  const result =TelemetryRecordSchema.safeParse(row)
  return result.success ? result.data : null
}