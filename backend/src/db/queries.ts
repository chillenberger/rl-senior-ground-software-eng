import Database from 'better-sqlite3'
import { SqliteDatabase } from './database'
import { InvalidColumnError, TelemetryRecordNotFoundError, UnknownSatelliteError, TelemetryConflictError, TelemetryParameterNotFoundError } from './errors'
import { 
  TelemetryRecord, 
  GetTelemetryRecordsOptions, 
  GetTelemetryRecordsOptionsSchema,
  TelemetryRecordDBSchema,
  TelemetryRecordSchema,
  SatelliteSummary,
  SatelliteSummaryDBSchema,
  SatelliteSummarySchema,
  TelemetryParameter,
  TelemetryParameterSchema,
  CreateTelemetryRecord,
  CreateTelemetryRecordRequestSchema,
} from './types'

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

function parseFieldName (value: string): string {
  if (!value.includes('.')) return value
  const [column, ...path] = value.split('.')
  const extract = path.map(key => `->>'${key.replaceAll("'", "''")}'`).join('')
  return `${column}${extract}`
}

function getTelemetryRecords (
  db: SqliteDatabase,
  options: GetTelemetryRecordsOptions = {},
): TelemetryRecord[] {
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

/*
Status is the latest timestamp group, not a named health reading.
Operators do not all send health_status. A group is out of spec when any
measurement in it has oos set.
*/
function listSatellites (db: SqliteDatabase): SatelliteSummary[] {
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

function getTelemetryRecordById (
  db: SqliteDatabase,
  id: string,
): TelemetryRecord {
  const row = db.prepare('SELECT * FROM telemetry WHERE id = ?').get(id)
  if (!row) throw new TelemetryRecordNotFoundError(id)
  return TelemetryRecordSchema.parse(row)
}

function isSameTelemetryRecord (
  stored: TelemetryRecord,
  record: CreateTelemetryRecord,
): boolean {
  return stored.measurement.name === record.name
    && stored.measurement.value === record.value
}

/*
Create a telemetry record.
If the record already exists with the same values, return the existing record.
If the record is different, throw a conflict error.
*/
function createTelemetryRecord (
  db: SqliteDatabase,
  record: CreateTelemetryRecord,
): TelemetryRecord {
  const parsed = CreateTelemetryRecordRequestSchema.parse(record)
  const parameter = getTelemetryParameterByName(db, parsed.satelliteId, parsed.name)
  if (parameter === undefined) throw new TelemetryParameterNotFoundError(parsed.name)

  const insert = db.prepare(`
    INSERT INTO telemetry (
      satellite_id, parameter_id, timestamp, measurement
    ) VALUES (?, ?, ?, ?)
    RETURNING *
  `)

  try {
    const row = insert.get(
      parsed.satelliteId,
      parameter.id,
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

function deleteTelemetryRecordById (
  db: SqliteDatabase,
  id: string,
): void {
  const row = db.prepare('DELETE FROM telemetry WHERE id = ?').run(id)
  if (row.changes === 0) throw new TelemetryRecordNotFoundError(id)
}

function getTelemetryParameters(db: SqliteDatabase, satelliteId: string): TelemetryParameter[] {
  const row = db.prepare(`
    SELECT * FROM telemetry_parameters WHERE satellite_id = ? AND deprecated_at IS NULL ORDER BY id
  `).all(satelliteId)
  return TelemetryParameterSchema.array().parse(row)
}

function getTelemetryParameterByName(db: SqliteDatabase, satelliteId: string, name: string): TelemetryParameter | undefined {
  const row = db.prepare(`
    SELECT * FROM telemetry_parameters WHERE satellite_id = ? AND name = ? AND deprecated_at IS NULL
  `).get(satelliteId, name)
  if (row === undefined) return undefined
  return TelemetryParameterSchema.parse(row)
}

function getTelemetryParameterCount(db: SqliteDatabase, satelliteId: string): number {
  const stmt = db.prepare(`
    SELECT COUNT(*) AS count FROM telemetry_parameters WHERE satellite_id = ? AND deprecated_at IS NULL
  `).get(satelliteId) as { count: number }
  return stmt.count
}

export {
  getTelemetryRecords,
  listSatellites,
  getTelemetryRecordById,
  createTelemetryRecord,
  deleteTelemetryRecordById,
  getTelemetryParameters,
  getTelemetryParameterByName,
  getTelemetryParameterCount,
}