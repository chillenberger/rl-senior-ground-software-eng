// This file contains code that we reuse between our tests.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import * as test from 'node:test'
import helper from 'fastify-cli/helper.js'
import { type FastifyInstance } from 'fastify'
import { openDatabase, type SqliteDatabase } from '../src/db/database'
import '../src/plugins/sqlite'

export type TestContext = {
  after: typeof test.after
}

const AppPath = path.join(__dirname, '..', 'src', 'app.ts')

// Fill in this config with all the configurations
// needed for testing the application
function config () {
  return {
    skipOverride: true // Register our application with fastify-plugin
  }
}

// Automatically build and tear down our instance
async function build (t: TestContext): Promise<FastifyInstance> {
  // you can set all the options supported by the fastify CLI command
  const argv = [AppPath]

  // fastify-plugin ensures that all decorators
  // are exposed for testing purposes, this is
  // different from the production setup
  // fastify-cli types this as ReturnType<typeof fastify>, which resolves to any.
  const app = await helper.build(argv, config()) as FastifyInstance

  // Tear down our app after we are done
  t.after(() => void app.close())

  return app
}

export const testSatellites = [
  { id: 'PHOTON-01', operator: 'Rocket Lab' },
  { id: 'AURORA-3', operator: 'Aurora Space' },
]

export const testReadings = [
  {
    id: '1',
    satellite_id: 'PHOTON-01',
    latitude: 10,
    longitude: 20,
    timestamp: '2026-09-25T16:00:00.000Z',
    altitude: 500000,
    velocity: 7.5,
    health_status: 'healthy' as const,
  },
  {
    id: '2',
    satellite_id: 'PHOTON-01',
    latitude: 11,
    longitude: 21,
    timestamp: '2026-09-25T17:00:00.000Z',
    altitude: 510000,
    velocity: 8,
    health_status: 'anomaly' as const,
  },
  {
    id: '3',
    satellite_id: 'AURORA-3',
    latitude: null,
    longitude: null,
    timestamp: '2026-09-25T16:20:00.000Z',
    altitude: 700000,
    velocity: 7,
    health_status: 'healthy' as const,
  },
  {
    id: '4',
    satellite_id: 'AURORA-3',
    latitude: 40,
    longitude: -74,
    timestamp: '2026-09-25T16:55:00.000Z',
    altitude: 450000,
    velocity: 6.5,
    health_status: 'critical' as const,
  },
]

function seedDatabase (db: SqliteDatabase): void {
  const insertSatellite = db.prepare('INSERT INTO satellites (id, operator) VALUES (?, ?)')
  for (const satellite of testSatellites) {
    insertSatellite.run(satellite.id, satellite.operator)
  }

  const insertTelemetry = db.prepare(`
    INSERT INTO telemetry (
      satellite_id, latitude, longitude, timestamp, altitude, velocity, health_status
    ) VALUES (
      @satellite_id, @latitude, @longitude, @timestamp, @altitude, @velocity, @health_status
    )
  `)
  for (const reading of testReadings) {
    insertTelemetry.run(reading)
  }
}

function createTempDatabase (t: TestContext): SqliteDatabase {
  const directory = mkdtempSync(path.join(tmpdir(), 'telemetry-'))
  const db = openDatabase(path.join(directory, 'telemetry.sqlite'))
  t.after(() => {
    db.close()
    rmSync(directory, { recursive: true, force: true })
  })
  return db
}

export {
  config,
  build,
  seedDatabase,
  createTempDatabase
}
