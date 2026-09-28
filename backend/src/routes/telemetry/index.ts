import { type FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { 
  getTelemetryRecords, 
  getTelemetryRecordById, 
  HealthStatusSchema,
  CreateTelemetryRecordRequestSchema,
  createTelemetryRecord,
  GetTelemetryRecordsOptionsSchema,
  TelemetryConflictError,
  UnknownSatelliteError,
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

const telemetry: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.get('/', {
    schema: {
      querystring: GetTelemetryRecordsOptionsSchema.strict(),
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

    return getTelemetryRecords(fastify.db, options)
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
    return record
  })

  fastify.post('/', {
    schema: {
      body: CreateTelemetryRecordRequestSchema.strict(),
      response: {
        200: TelemetryRecordResponseSchema,
      }
    },
  }, async function (request) {
    try {
      return createTelemetryRecord(fastify.db, request.body)
    } catch (error) {
      if (error instanceof TelemetryConflictError) {
        throw fastify.httpErrors.conflict(error.message)
      }
      if (error instanceof UnknownSatelliteError) {
        throw fastify.httpErrors.notFound(error.message)
      }
      throw error
    }
  })
}

export default telemetry
