import { test } from 'node:test'
import * as assert from 'node:assert'
import { build, seedDatabase, testSatellites } from '../../helper'

type TelemetryBody = {
  id: string
  timestamp: string
  satelliteId: string
  status: string
  altitude: number
  velocity: number
}

test('post telemetry record', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const healthyPhoton = {
    timestamp: '2026-09-26T12:00:00Z',
    satelliteId: testSatellites[0].id,
    status: 'healthy',
    altitude: 100,
    velocity: 10,
  }

  const res = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: healthyPhoton,
  })

  assert.equal(res.statusCode, 200)
  const body = res.json<TelemetryBody>()
  assert.equal(body.timestamp, '2026-09-26T12:00:00.000Z')
  assert.equal(body.satelliteId, healthyPhoton.satelliteId)
  assert.equal(body.status, healthyPhoton.status)
  assert.equal(body.altitude, healthyPhoton.altitude)
  assert.equal(body.velocity, healthyPhoton.velocity)
  assert.equal(typeof body.id, 'string')
})

test('post telemetry record with invalid body', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)

  const res = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: { invalid: 'body' },
  })

  assert.equal(res.statusCode, 400)
})

test('post telemetry record with invalid iso datetime', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)

  const res = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: { timestamp: 'invalid', satelliteId: '1', status: 'healthy', altitude: 100, velocity: 10 },
  })

  assert.equal(res.statusCode, 400)
})

test('post telemetry record with invalid altitude', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)

  const res = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: { timestamp: '2026-09-26T12:00:00Z', satelliteId: '1', status: 'healthy', altitude: -1, velocity: 10 },
  })

  assert.equal(res.statusCode, 400)
})

test('post telemetry record with invalid velocity', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)

  const res = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: { timestamp: '2026-09-26T12:00:00Z', satelliteId: '1', status: 'healthy', altitude: 100, velocity: -1 },
  })

  assert.equal(res.statusCode, 400)
})

test('post telemetry record is idempotent for the same satellite and timestamp', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const reading = {
    satelliteId: testSatellites[0].id,
    status: 'healthy',
    altitude: 100,
    velocity: 10,
  }

  const first = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: { ...reading, timestamp: '2026-09-26T12:00:00Z' },
  })

  const replay = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: { ...reading, timestamp: '2026-09-26T12:00:00.000Z' },
  })

  assert.equal(first.statusCode, 200)
  assert.equal(replay.statusCode, 200)
  const firstBody = first.json<TelemetryBody>()
  const replayBody = replay.json<TelemetryBody>()
  assert.deepEqual(replayBody, firstBody)
  assert.equal(replayBody.id, firstBody.id)
})

test('post telemetry record conflicts when the same instant has different values', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const reading = {
    timestamp: '2026-09-26T12:00:00Z',
    satelliteId: testSatellites[0].id,
    status: 'healthy',
    altitude: 100,
    velocity: 10,
  }

  const first = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: reading,
  })
  const conflict = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: { ...reading, altitude: 200 },
  })

  assert.equal(first.statusCode, 200)
  assert.equal(conflict.statusCode, 409)
})