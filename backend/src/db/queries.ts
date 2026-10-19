import { z } from 'zod'
import Database from 'better-sqlite3'
import { SqliteDatabase } from './database'
import { InvalidColumnError, TelemetryRecordNotFoundError, UnknownSatelliteError, TelemetryConflictError } from './errors'

export const OrderDirectionSchema = z.enum(['asc', 'desc'])

export const NumericMeasurementSchema = z.object({
  value: z.number(),
  name: z.string(),
  units: z.string(),
  oos: z.boolean().optional(),
})

export const TextMeasurementSchema = z.object({
  value: z.string(),
  name: z.string(),
  oos: z.boolean().optional(),
})

export const MeasurementSchema = NumericMeasurementSchema.or(TextMeasurementSchema)

// SQLite returns the JSON measurement column as text.
function parseStoredMeasurement (value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return value
  }
}

/*
SQLite schema for the telemetry table.
SQLite is case insensitive, so we use the snake_case column names.
*/
export const TelemetryRecordDBSchema = z.object({
  id: z.number(),
  satellite_id: z.string(),
  timestamp: z.string(),
  measurement: z.preprocess(parseStoredMeasurement, MeasurementSchema),
  created_at: z.string(),
})

/* 
Efficient snake_case to camelCase transformation.  
*/
export const TelemetryRecordSchema = TelemetryRecordDBSchema.transform((record) => ({
  id: record.id.toString(),
  satelliteId: record.satellite_id,
  timestamp: record.timestamp,
  measurement: record.measurement,
  createdAt: record.created_at,
}))
export type TelemetryRecord = z.infer<typeof TelemetryRecordSchema>

const TelemetryFilterSchema = z.object({
  name: z.string(),
  value: z.string(),
})

// Query strings deliver one filter as a JSON string and repeated filters as an array of JSON strings.
// Direct callers pass the parsed objects.
function parseFilterQuery (value: unknown): unknown {
  if (value === undefined) return undefined
  const items = Array.isArray(value) ? value : [value]
  return items.map((item) => {
    if (typeof item !== 'string') return item
    try {
      return JSON.parse(item) as unknown
    } catch {
      return item
    }
  })
}

export const GetTelemetryRecordsOptionsSchema = z.object({
  id: z.string().optional(),
  limit: z.coerce.number().int().nonnegative().optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
  orderBy: z.string().optional(),
  orderDirection: OrderDirectionSchema.optional(),
  satelliteId: z.string().optional(),
  filterBy: z.preprocess(parseFilterQuery, z.array(TelemetryFilterSchema).optional()),
})

function parseFieldName (value: string): string {
  if (!value.includes('.')) return value
  const [column, ...path] = value.split('.')
  const extract = path.map(key => `->>'${key.replaceAll("'", "''")}'`).join('')
  return `${column}${extract}`
}

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
  for (const filter of parsed.filterBy ?? []) {
    clauses.push(`${parseFieldName(filter.name)} = ?`)
    params.push(filter.value)
  }

  let query = 'SELECT * FROM telemetry'
  if (clauses.length > 0) {
    query += ` WHERE ${clauses.join(' AND ')}`
  }

  if (parsed.orderBy !== undefined) {
    const direction = parsed.orderDirection === 'desc' ? 'DESC' : 'ASC'
    query += ` ORDER BY ${parseFieldName(parsed.orderBy)} ${direction}, id ASC`
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
  try {
    const rows = db.prepare(query).all(...params).map(row => TelemetryRecordDBSchema.parse(row))
    return TelemetryRecordSchema.array().parse(rows)
  } catch (error) {
    if (error instanceof Database.SqliteError && error.message.startsWith('no such column: ')) {
      throw new InvalidColumnError(error.message.slice('no such column: '.length))
    }
    if (error instanceof Database.SqliteError) {
      throw new Error(`Database error: ${error.message}`)
    }
    throw error
  }
}

// SQLite returns EXISTS as 0 or 1, and NULL when the satellite has no telemetry.
const NullableSqliteBooleanSchema = z.union([z.boolean(), z.number(), z.null()]).transform((value) => {
  if (value === null) return null
  return value === true || value === 1
})

const SatelliteSummaryDBSchema = z.object({
  id: z.string(),
  operator: z.string(),
  updated_at: z.string().nullable(),
  oos: NullableSqliteBooleanSchema,
})

export const SatelliteSummarySchema = z.object({
  id: z.string(),
  operator: z.string(),
  updatedAt: z.string().nullable(),
  oos: z.boolean().nullable(),
})

export type SatelliteSummary = z.infer<typeof SatelliteSummarySchema>

/*
Status is the latest timestamp group, not a named health reading.
Operators do not all send health_status. A group is out of spec when any
measurement in it has oos set.
*/
export function listSatellites (db: SqliteDatabase): SatelliteSummary[] {
  const rows = db.prepare(`
    SELECT
      satellites.id AS id,
      satellites.operator AS operator,
      latest.timestamp AS updated_at,
      CASE
        WHEN latest.timestamp IS NULL THEN NULL
        WHEN EXISTS (
          SELECT 1
          FROM telemetry
          WHERE telemetry.satellite_id = satellites.id
            AND telemetry.timestamp = latest.timestamp
            AND json_extract(telemetry.measurement, '$.oos') = 1
        ) THEN 1
        ELSE 0
      END AS oos
    FROM satellites
    LEFT JOIN (
      SELECT satellite_id, MAX(timestamp) AS timestamp
      FROM telemetry
      GROUP BY satellite_id
    ) AS latest
      ON latest.satellite_id = satellites.id
    ORDER BY satellites.id ASC
  `).all().map(row => SatelliteSummaryDBSchema.parse(row))

  return rows.map((row) => SatelliteSummarySchema.parse({
    id: row.id,
    operator: row.operator,
    updatedAt: row.updated_at,
    oos: row.oos,
  }))
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
  value: z.number().or(z.string()),
  name: z.string(),
  units: z.string().optional(),
  oos: z.boolean().optional(),
})

function isSameTelemetryRecord (
  stored: z.output<typeof TelemetryRecordSchema>,
  record: z.input<typeof CreateTelemetryRecordRequestSchema>,
): boolean {
  return stored.measurement.name === record.name
    && stored.measurement.value === record.value
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
      satellite_id, timestamp, measurement
    ) VALUES (?, ?, ?)
    RETURNING *
  `)

  try {
    const row = insert.get(
      parsed.satelliteId,
      parsed.timestamp,
      JSON.stringify({
        name: parsed.name,
        value: parsed.value,
        oos: parsed.oos ?? false,
        ...(parsed.units === undefined ? {} : { units: parsed.units }),
      }),
    )
    return TelemetryRecordSchema.parse(row)
  } catch (error) {
    if (((error instanceof Database.SqliteError) && error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY')) throw new UnknownSatelliteError(parsed.satelliteId)
    if (!((error instanceof Database.SqliteError) && error.code === 'SQLITE_CONSTRAINT_UNIQUE')) throw error

    const existing = db
      .prepare(`
        SELECT * FROM telemetry
        WHERE satellite_id = ? AND timestamp = ? AND measurement->>'name' = ?
      `)
      .get(parsed.satelliteId, parsed.timestamp, parsed.name)
    const stored = TelemetryRecordSchema.safeParse(existing)
    if (!stored.success) throw error
    if (isSameTelemetryRecord(stored.data, parsed)) return stored.data

    throw new TelemetryConflictError(parsed.name)
  }
}

export function deleteTelemetryRecordById (
  db: SqliteDatabase,
  id: string,
): void {
  const row = db.prepare('DELETE FROM telemetry WHERE id = ?').run(id)
  if (row.changes === 0) throw new TelemetryRecordNotFoundError(id)
}

// SQLite stores BOOLEAN columns as 0 or 1.
const SqliteBooleanSchema = z.union([z.boolean(), z.number()]).transform(value => value === true || value === 1)

export const TelemetryParameterSchema = z.object({
  id: z.number(),
  satellite_id: z.string(),
  name: z.string(),
  definition: z.string().nullable(),
  created_at: z.string(),
  derived: SqliteBooleanSchema,
})

export function getTelemetryParameters(db: SqliteDatabase, satelliteId: string): z.output<typeof TelemetryParameterSchema>[] {
  const row = db.prepare(`
    SELECT * FROM telemetry_parameters WHERE satellite_id = ? ORDER BY id
  `).all(satelliteId)
  return TelemetryParameterSchema.array().parse(row)
}

export function getTelemetryParameterByName(db: SqliteDatabase, satelliteId: string, name: string): z.output<typeof TelemetryParameterSchema> | undefined {
  const row = db.prepare(`
    SELECT * FROM telemetry_parameters WHERE satellite_id = ? AND name = ?
  `).get(satelliteId, name)
  if (row === undefined) return undefined
  return TelemetryParameterSchema.parse(row)
}

export function getTelemetryParameterCount(db: SqliteDatabase, satelliteId: string): number {
  const stmt = db.prepare(`
    SELECT COUNT(*) AS count FROM telemetry_parameters WHERE satellite_id = ?
  `).get(satelliteId) as { count: number }
  return stmt.count
}