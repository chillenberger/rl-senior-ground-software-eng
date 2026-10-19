import { type FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { getTelemetryParameters } from '../../db/queries'

const telemetryParameters: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.get('/:satellite_id', {
    schema: {
      params: z.object({
        satellite_id: z.string(),
      }),
      response: {
        200: z.array(z.string()),
      },
    },
  }, async function (request) {
    console.log("sat id: ", request.params.satellite_id)
    return getTelemetryParameters(fastify.db, request.params.satellite_id).map(param => param.name)
  })
}

export default telemetryParameters
