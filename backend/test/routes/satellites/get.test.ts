import { test } from 'node:test'
import * as assert from 'node:assert'
import { build, seedDatabase } from '../../helper'

type LatestReading = {
  id: string
  timestamp: string
  altitude: number
  velocity: number
  status: string
}

type SatelliteSummary = {
  id: string
  operator: string
  createdAt: string
  updatedAt: string
  latestReading: LatestReading | null
}

test('lists satellites with their most recent reading', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  app.db.prepare('INSERT INTO satellites (id, operator) VALUES (?, ?)').run('EMPTY-1', 'No Readings')

  const res = await app.inject({ url: '/satellites' })

  assert.equal(res.statusCode, 200)
  const satellites = res.json<SatelliteSummary[]>()
  assert.deepEqual(satellites.map(satellite => satellite.id), ['AURORA-3', 'EMPTY-1', 'PHOTON-01'])

  const empty = satellites.find(satellite => satellite.id === 'EMPTY-1')
  assert.equal(empty?.operator, 'No Readings')
  assert.equal(empty?.latestReading, null)
  assert.equal(typeof empty?.createdAt, 'string')
  assert.equal(typeof empty?.updatedAt, 'string')

  assert.deepEqual(satellites.find(satellite => satellite.id === 'AURORA-3')?.latestReading, {
    id: '4',
    timestamp: '2026-09-25T16:55:00.000Z',
    altitude: 450000,
    velocity: 6.5,
    status: 'critical',
  })

  assert.deepEqual(satellites.find(satellite => satellite.id === 'PHOTON-01')?.latestReading, {
    id: '2',
    timestamp: '2026-09-25T17:00:00.000Z',
    altitude: 510000,
    velocity: 8,
    status: 'anomaly',
  })
})
