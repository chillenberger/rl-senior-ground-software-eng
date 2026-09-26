import { type FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { 
  getTelemetryRecords, 
  getTelemetryRecordById, 
  HealthStatusSchema, 
  OrderTelemetryColumnsSchema, 
  OrderDirectionSchema,
  TelemetryRecordSchema
} from '../../db/database'
import type { GetTelemetryRecordsOptions } from '../../db/database'

const TelemetryRecordResponseSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  satelliteId: z.string(),
  status: HealthStatusSchema,
  altitude: z.number(),
  velocity: z.number(),
})

/* 
Reconcile SQLite column case insensitivity with api requirement of camel case standard.
*/
const toTelemetryRecordResponseSchema = TelemetryRecordSchema.transform((record) => ({
  id: record.id.toString(),
  timestamp: record.timestamp,
  satelliteId: record.satellite_id,
  status: record.health_status,
  altitude: record.altitude,
  velocity: record.velocity,
})).pipe(TelemetryRecordResponseSchema)

const telemetry: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.get('/', {
    schema: {
      querystring: z.object({
        id: z.string().optional(),
        limit: z.coerce.number().int().nonnegative().optional(),
        offset: z.coerce.number().int().nonnegative().optional(),
        orderBy: OrderTelemetryColumnsSchema.optional(),
        orderDirection: OrderDirectionSchema.optional(),
        satelliteId: z.string().optional(),
        status: HealthStatusSchema.optional(),
      }).strict(),
      response: {
        200: z.array(TelemetryRecordResponseSchema),
      },
    },
  }, async function (request) {
    const options: GetTelemetryRecordsOptions = {
      ...request.query,
      orderBy: request.query.orderBy ?? 'timestamp',
      orderDirection: request.query.orderDirection ?? 'desc',
    }

    const telemetryRecords = getTelemetryRecords(fastify.db, options)

    return toTelemetryRecordResponseSchema.array().parse(telemetryRecords)
  })

  fastify.get('/:telemetry_id', {
    schema: {
      params: z.object({
        telemetry_id: z.string(),
      }),
      response: {
        200: TelemetryRecordResponseSchema,
      },
    },
  }, async function (request) {
    const record = getTelemetryRecordById(fastify.db, request.params.telemetry_id)
    if (!record) {
      throw fastify.httpErrors.notFound('Telemetry record not found')
    }
    return toTelemetryRecordResponseSchema.parse(record)
  })
}

export default telemetry
