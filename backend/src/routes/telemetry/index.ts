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
  deleteTelemetryRecordById,
  TelemetryRecordNotFoundError,
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
    try {
      return getTelemetryRecordById(fastify.db, request.params.telemetry_id)
    } catch (error) {
      if (error instanceof TelemetryRecordNotFoundError) {
        throw fastify.httpErrors.notFound(error.message)
      }
      throw error
    }
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

  fastify.delete('/:telemetry_id', {
    schema: {
      params: z.object({
        telemetry_id: z.string(),
      }),
      response: {
        204: z.null(),
      }
    },
  }, async function (request, reply) {
    try {
      deleteTelemetryRecordById(fastify.db, request.params.telemetry_id)
    } catch (error) {
      if (error instanceof TelemetryRecordNotFoundError) {
        throw fastify.httpErrors.notFound(error.message)
      }
      throw error
    }
    return reply.code(204).send(null)
  })
}

export default telemetry
