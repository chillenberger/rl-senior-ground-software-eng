// This file contains code that we reuse between our tests.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'
import * as test from 'node:test'
import helper from 'fastify-cli/helper.js'
import { type FastifyInstance } from 'fastify'
import { openDatabase, type SqliteDatabase } from '../src/db/database'
import { clearTelemetryCache } from '../src/telemetry/definitions'
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
  clearTelemetryCache()

  // Tear down our app after we are done
  t.after(() => void app.close())

  return app
}

export const testSatellites = [
  { id: 'PHOTON-01', operator: 'Rocket Lab' },
  { id: 'AURORA-3', operator: 'Aurora Space' },
]

const testTelemetryParameters = [
  {
    satellite_id: 'PHOTON-01',
    name: 'voltage',
    derived: false,
    definition: JSON.stringify({ units: 'v', check: 'voltage >= 0', spec: 'voltage > 5 and voltage < 12' }),
  },
  {
    satellite_id: 'PHOTON-01',
    name: 'current',
    derived: false,
    definition: JSON.stringify({ units: 'a', check: 'current >= 0', spec: 'current > 0 and current < 10' }),
  },
  {
    satellite_id: 'PHOTON-01',
    name: 'altitude',
    derived: false,
    definition: JSON.stringify({ units: 'm', check: 'altitude >= 0', spec: 'altitude > 0' }),
  },
  {
    satellite_id: 'PHOTON-01',
    name: 'health_status',
    derived: true,
    definition: JSON.stringify({
      equation: 'voltage > 5 and current < 2 ? "healthy" : "anomaly"',
      check: 'health_status == "healthy" or health_status == "anomaly" or health_status == "critical"',
      spec: 'health_status == "healthy"',
    }),
  },
  { satellite_id: 'AURORA-3', name: 'health_status', derived: false, definition: null },
  {
    satellite_id: 'PHOTON-01',
    name: 'power',
    derived: true,
    definition: JSON.stringify({ equation: 'voltage * current', units: 'w' }),
  },
]

export const testReadings = [
  {
    id: '1',
    satellite_id: 'PHOTON-01',
    timestamp: '2026-09-25T16:00:00.000Z',
    measurement: {
      value: 6,
      units: 'v',
      name: 'voltage'
    }
  }, 
  {
    id: '2',
    satellite_id: 'PHOTON-01',
    timestamp: '2026-09-25T17:00:00.000Z',
    measurement: {
      value: 7,
      units: 'a',
      name: 'current'
    }
  },
  {
    id: '3',
    satellite_id: 'PHOTON-01',
    timestamp: '2026-09-25T18:00:00.000Z',
    measurement: {
      value: 'anomaly',
      name: 'health_status'
    }
  },
  {
    id: '4',
    satellite_id: 'AURORA-3',
    timestamp: '2026-09-25T16:20:00.000Z',
    measurement: {
      value: 'healthy',
      name: 'health_status'
    }
  }, 
  {
    id: '5',
    satellite_id: 'AURORA-3',
    timestamp: '2026-09-25T16:55:00.000Z',
    measurement: {
      value: 'anomaly',
      name: 'health_status'
    }
  }
]

function clearDatabase (db: SqliteDatabase): void {
  db.exec(`
    DELETE FROM telemetry;
    DELETE FROM telemetry_parameters;
    DELETE FROM satellites;
    DELETE FROM sqlite_sequence WHERE name IN ('telemetry', 'telemetry_parameters');
  `)
}

function seedDatabase (db: SqliteDatabase): void {
  clearDatabase(db)

  const insertSatellite = db.prepare('INSERT INTO satellites (id, operator) VALUES (?, ?)')
  for (const satellite of testSatellites) {
    insertSatellite.run(satellite.id, satellite.operator)
  }

  const insertTelemetryParameter = db.prepare(
    'INSERT INTO telemetry_parameters (satellite_id, name, derived, definition) VALUES (?, ?, ?, ?)',
  )
  for (const parameter of testTelemetryParameters) {
    insertTelemetryParameter.run(parameter.satellite_id, parameter.name, parameter.derived ? 1 : 0, parameter.definition)
  }

  const insertTelemetry = db.prepare(`
    INSERT INTO telemetry (
      satellite_id, timestamp, measurement
    ) VALUES (
      @satellite_id, @timestamp, @measurement
    )
  `)
  for (const reading of testReadings) {
    insertTelemetry.run({
      satellite_id: reading.satellite_id,
      timestamp: reading.timestamp,
      measurement: JSON.stringify(reading.measurement),
    })
  }
}

function createTempDatabase (t: TestContext): SqliteDatabase {
  clearTelemetryCache()
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
  clearDatabase,
  seedDatabase,
  createTempDatabase
}
