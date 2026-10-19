import { type FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { 
  getTelemetryRecords, 
  getTelemetryRecordById,
  CreateTelemetryRecordRequestSchema,
  GetTelemetryRecordsOptionsSchema,
  deleteTelemetryRecordById,
  MeasurementSchema,
} from '../../db/queries'
import { ingestTelemetry } from '../../telemetry/definitions'
import { InvalidColumnError, TelemetryRecordNotFoundError, TelemetryConflictError, UnknownSatelliteError, TelemetryCheckFailedError, TelemetryParameterNotFoundError } from '../../db/errors'
import type { GetTelemetryRecordsOptions } from '../../db/queries'

const TelemetryRecordResponseSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  satelliteId: z.string(),
  measurement: MeasurementSchema,
})

const telemetry: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.get('/', {
    schema: {
      querystring: GetTelemetryRecordsOptionsSchema.strict(),
      response: {
        200: z.object({
          records: z.array(TelemetryRecordResponseSchema),
          hasMore: z.boolean(),
        }),
      },
    },
  }, async function (request) {
    try {
      const options: GetTelemetryRecordsOptions = {
        ...request.query,
        orderBy: request.query.orderBy ?? 'timestamp',
        orderDirection: request.query.orderDirection ?? 'desc',
        ...(request.query.limit === undefined ? {} : { limit: request.query.limit + 1 }),
      }

      const rows = getTelemetryRecords(fastify.db, options)
      const hasMore = request.query.limit !== undefined && rows.length > request.query.limit

      return {
        records: hasMore ? rows.slice(0, request.query.limit) : rows,
        hasMore,
      }
    } catch (error) {
      if (error instanceof InvalidColumnError) {
        throw fastify.httpErrors.badRequest(error.message)
      }
      throw error
    }
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
      return ingestTelemetry(fastify.db, request.body)
    } catch (error) {
      if (error instanceof TelemetryConflictError) {
        throw fastify.httpErrors.conflict(error.message)
      }
      if (error instanceof UnknownSatelliteError || error instanceof TelemetryParameterNotFoundError) {
        throw fastify.httpErrors.notFound(error.message)
      }
      if (error instanceof TelemetryCheckFailedError) {
        throw fastify.httpErrors.badRequest(error.message)
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
