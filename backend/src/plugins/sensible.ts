import fp from 'fastify-plugin'
import sensible, { FastifySensibleOptions } from '@fastify/sensible'
import {
  serializerCompiler,
  validatorCompiler,
} from '@fastify/type-provider-zod'

/**
 * This plugins adds some utilities to handle http errors
 *
 * @see https://github.com/fastify/fastify-sensible
 */
export default fp<FastifySensibleOptions>(async (fastify) => {
  await fastify.register(sensible)

  fastify.setValidatorCompiler(validatorCompiler)
  fastify.setSerializerCompiler(serializerCompiler)
})
