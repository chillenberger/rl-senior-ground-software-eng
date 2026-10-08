/* 
I chose to add a satellites route. This makes it easy to view all satellites and their most 
recent telemetry data.  
*/
import { type FastifyPluginAsyncZod } from '@fastify/type-provider-zod'
import { z } from 'zod'
import { listSatellites, SatelliteSummarySchema } from '../../db/queries'


const satellites: FastifyPluginAsyncZod = async (fastify): Promise<void> => {
  fastify.get('/', {
    schema: {
      response: {
        200: z.array(SatelliteSummarySchema),
      },
    },
  }, async function () {
    return listSatellites(fastify.db)
  })
}

export default satellites
