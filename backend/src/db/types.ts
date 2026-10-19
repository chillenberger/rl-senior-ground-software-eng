import { z } from 'zod'

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

// SQLite returns JSON columns as text.
function parseStoredJson (value: unknown): unknown {
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
  parameter_id: z.number(),
  timestamp: z.string(),
  measurement: z.preprocess(parseStoredJson, MeasurementSchema),
  created_at: z.string(),
})

/* 
Efficient snake_case to camelCase transformation.  
*/
export const TelemetryRecordSchema = TelemetryRecordDBSchema.transform((record) => ({
  id: record.id.toString(),
  satelliteId: record.satellite_id,
  parameterId: record.parameter_id,
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

export type GetTelemetryRecordsOptions = z.output<typeof GetTelemetryRecordsOptionsSchema>


// SQLite returns EXISTS as 0 or 1, and NULL when the satellite has no telemetry.
const NullableSqliteBooleanSchema = z.union([z.boolean(), z.number(), z.null()]).transform((value) => {
  if (value === null) return null
  return value === true || value === 1
})

export const SatelliteSummaryDBSchema = z.object({
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

// SQLite stores BOOLEAN columns as 0 or 1.
const SqliteBooleanSchema = z.union([z.boolean(), z.number()]).transform(value => value === true || value === 1)

export const TelemetryDefinitionSchema = z.object({
  check: z.string().optional(),
  spec: z.string().optional(),
  units: z.string().optional(),
  equation: z.string().optional(),
})

export type TelemetryDefinition = z.infer<typeof TelemetryDefinitionSchema>

export const TelemetryParameterMetadataSchema = z.record(z.string(), z.json())

export type TelemetryParameterMetadata = z.infer<typeof TelemetryParameterMetadataSchema>

export const TelemetryParameterSchema = z.object({
  id: z.number(),
  satellite_id: z.string(),
  name: z.string(),
  definition: z.preprocess(parseStoredJson, TelemetryDefinitionSchema.nullable()),
  created_at: z.string(),
  derived: SqliteBooleanSchema,
  deprecated_at: z.string().nullable(),
  metadata: z.preprocess(parseStoredJson, TelemetryParameterMetadataSchema.nullable()),
})

export type TelemetryParameter = z.infer<typeof TelemetryParameterSchema>

export const CreateTelemetryRecordRequestSchema = z.object({
  timestamp: z.iso.datetime({ offset: true}).transform((value) => new Date(value).toISOString()),
  satelliteId: z.string(),
  value: z.number().or(z.string()),
  name: z.string(),
  units: z.string().optional(),
  oos: z.boolean().optional(),
})

export type CreateTelemetryRecord = z.output<typeof CreateTelemetryRecordRequestSchema>
