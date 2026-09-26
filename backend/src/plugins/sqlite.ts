import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import { DEFAULT_DATABASE_PATH, openDatabase, SqliteDatabase } from '../db/database'

export interface SqlitePluginOptions {
  filename?: string
}

/**
 * Opens SQLite and exposes it as `fastify.db`.
 * Autoload registers this before routes, so handlers can query immediately.
 */
const sqlitePlugin: FastifyPluginAsync<SqlitePluginOptions> = async (fastify, opts) => {
  const filename = opts.filename ?? process.env.SQLITE_PATH ?? DEFAULT_DATABASE_PATH
  const db = openDatabase(filename)

  fastify.decorate('db', db)
  fastify.addHook('onClose', () => {
    db.close()
  })
}

export default fp(sqlitePlugin, {
  name: 'sqlite'
})

declare module 'fastify' {
  interface FastifyInstance {
    db: SqliteDatabase
  }
}
