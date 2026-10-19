import { test } from 'node:test'
import * as assert from 'node:assert'
import { build, seedDatabase, testSatellites } from '../../helper'
import { z } from 'zod'
import { MeasurementSchema } from '../../../src/db/types'

type TelemetryBody = {
  id: string
  timestamp: string
  satelliteId: string
  parameterId: number
  measurement: z.infer<typeof MeasurementSchema>
}

test('post telemetry record', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const healthyPhoton = {
    timestamp: '2026-09-26T12:00:00Z',
    satelliteId: testSatellites[0].id,
    value: 100,
    name: 'altitude'
  }

  const res = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: healthyPhoton,
  })

  assert.equal(res.statusCode, 200)
  const body = res.json<TelemetryBody>()
  const parameter = app.db.prepare(
    'SELECT id FROM telemetry_parameters WHERE satellite_id = ? AND name = ?',
  ).get(healthyPhoton.satelliteId, healthyPhoton.name) as { id: number }
  assert.equal(body.timestamp, '2026-09-26T12:00:00.000Z')
  assert.equal(body.satelliteId, healthyPhoton.satelliteId)
  assert.equal(body.parameterId, parameter.id)
  assert.equal(body.measurement.value, healthyPhoton.value)
  assert.equal(body.measurement.oos, false)
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
    body: { 
      timestamp: 'invalid', 
      satelliteId: '1', 
      value: 100, 
      name: 'altitude'
    },
  })

  assert.equal(res.statusCode, 400)
})

test('post telemetry record rejects an unknown parameter', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)

  const res = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: {
      timestamp: '2026-09-26T12:00:00Z',
      satelliteId: testSatellites[0].id,
      value: 'healthy',
      name: 'invalid',
    },
  })
  assert.equal(res.statusCode, 404)
})

test('post telemetry record rejects an altitude that fails its check', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)

  const res = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: { 
      timestamp: '2026-09-26T12:00:00Z', 
      satelliteId: testSatellites[0].id, 
      value: -1, 
      name: 'altitude'
    },
  })
  assert.equal(res.statusCode, 400)
})

test('post telemetry record stores an out of spec altitude', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)

  const res = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: { 
      timestamp: '2026-09-26T12:00:00Z', 
      satelliteId: testSatellites[0].id, 
      value: 0, 
      name: 'altitude'
    },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.json<TelemetryBody>().measurement.oos, true)
})

test('post telemetry record is idempotent for the same satellite and timestamp', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const reading = {
    satelliteId: testSatellites[0].id,
    value: 100,
    name: 'altitude'
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

test('post telemetry record accepts another channel at the same instant', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const timestamp = '2026-09-26T12:00:00Z'
  const satelliteId = testSatellites[0].id

  const altitude = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: { timestamp, satelliteId, name: 'altitude', value: 100 },
  })
  const health = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: { timestamp, satelliteId, name: 'health_status', value: 'healthy' },
  })
  const replay = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: { timestamp: '2026-09-26T12:00:00.000Z', satelliteId, name: 'health_status', value: 'healthy' },
  })
  const conflict = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: { timestamp, satelliteId, name: 'health_status', value: 'anomaly' },
  })

  assert.equal(altitude.statusCode, 200)
  assert.equal(health.statusCode, 200)
  assert.equal(replay.statusCode, 200)
  assert.equal(conflict.statusCode, 409)
  const healthBody = health.json<TelemetryBody>()
  const replayBody = replay.json<TelemetryBody>()
  assert.equal(replayBody.id, healthBody.id)
  assert.notEqual(healthBody.id, altitude.json<TelemetryBody>().id)
  assert.equal(replayBody.measurement.name, 'health_status')
  assert.equal(replayBody.measurement.value, 'healthy')
})

test('post telemetry record conflicts when the same instant has different values', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const reading = {
    timestamp: '2026-09-26T12:00:00Z',
    satelliteId: testSatellites[0].id,
    value: 100,
    name: 'altitude'
  }

  const first = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: reading,
  })
  const conflict = await app.inject({
    url: '/telemetry',
    method: 'POST',
    body: {
      ...reading,
      value: 200,
    },
  })

  assert.equal(first.statusCode, 200)
  assert.equal(conflict.statusCode, 409)
})