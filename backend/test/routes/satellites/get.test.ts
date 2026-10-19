import { test } from 'node:test'
import * as assert from 'node:assert'
import { build, seedDatabase } from '../../helper'

type SatelliteSummary = {
  id: string
  operator: string
  updatedAt: string | null
  oos: boolean | null
}

test('lists satellites with oos on their latest timestamp group', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  app.db.prepare('INSERT INTO satellites (id, operator) VALUES (?, ?)').run('EMPTY-1', 'No Readings')
  const altitude = app.db.prepare(
    `SELECT id FROM telemetry_parameters WHERE satellite_id = 'PHOTON-01' AND name = 'altitude'`,
  ).get() as { id: number }
  app.db.prepare(`
    INSERT INTO telemetry (satellite_id, parameter_id, timestamp, measurement) VALUES
      ('PHOTON-01', ?, '2026-09-25T18:00:00.000Z', '{"value": 100, "units": "m", "name": "altitude", "oos": true}')
  `).run(altitude.id)

  const res = await app.inject({ url: '/satellites' })

  assert.equal(res.statusCode, 200)
  const satellites = res.json<SatelliteSummary[]>()
  assert.deepEqual(satellites.map(satellite => satellite.id), ['AURORA-3', 'EMPTY-1', 'PHOTON-01'])

  const empty = satellites.find(satellite => satellite.id === 'EMPTY-1')
  assert.equal(empty?.operator, 'No Readings')
  assert.equal(empty?.oos, null)
  assert.equal(empty?.updatedAt, null)

  assert.equal(satellites.find(satellite => satellite.id === 'AURORA-3')?.oos, false)
  assert.equal(satellites.find(satellite => satellite.id === 'AURORA-3')?.updatedAt, '2026-09-25T16:55:00.000Z')

  assert.equal(satellites.find(satellite => satellite.id === 'PHOTON-01')?.oos, true)
  assert.equal(satellites.find(satellite => satellite.id === 'PHOTON-01')?.updatedAt, '2026-09-25T18:00:00.000Z')
})
