/*
I chose to add a health check route. This makes it easy to ensure 
server and DB are accessible. 
*/
import { type FastifyPluginAsync } from 'fastify'

const health: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get('/', async function () {
    fastify.db.prepare('SELECT 1').get()
    return { status: 'ok' }
  })
}

export default health
