import { test } from 'node:test'
import * as assert from 'node:assert'
import { build, seedDatabase, testReadings } from '../../helper'

const requiredFields = ['id', 'timestamp', 'satelliteId', 'status', 'altitude', 'velocity']

type TelemetryBody = {
  id: string
  timestamp: string
  satelliteId: string
  status: string
  altitude: number
  velocity: number
}

test('get telemetry records with filters', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const healthyPhoton = testReadings[0]

  const res = await app.inject({
    url: '/telemetry',
    query: {
      satelliteId: healthyPhoton.satellite_id,
      status: healthyPhoton.health_status,
    }
  })

  assert.equal(res.statusCode, 200)
  const records = res.json<TelemetryBody[]>()
  assert.equal(records.length, 1)
  assert.equal(records[0].satelliteId, healthyPhoton.satellite_id)
  assert.equal(records[0].status, healthyPhoton.health_status)
  assert.equal(records[0].timestamp, healthyPhoton.timestamp)

  const resFields = Object.keys(records[0])
  requiredFields.forEach((key: string) => {
    assert.ok(resFields.includes(key), `Field ${key} is required`)
  })
})

test('missing limit filter returns all rows', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)

  const res = await app.inject({
    url: '/telemetry'
  })

  assert.equal(res.statusCode, 200)
  const records = res.json<TelemetryBody[]>()
  assert.equal(records.length, testReadings.length)
})

test('bad filters return 400', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)

  let res = await app.inject({
    url: '/telemetry',
    query: {
      limit: 'invalid'
    }
  })

  assert.equal(res.statusCode, 400, "Invalid limit should return 400")

  res = await app.inject({
    url: '/telemetry',
    query: {
      limit: '-1'
    }
  })

  assert.equal(res.statusCode, 400, "Negative limit should return 400")

  res = await app.inject({
    url: '/telemetry',
    query: {
      offset: 'invalid'
    }
  })

  assert.equal(res.statusCode, 400, "Invalid offset should return 400")

  res = await app.inject({
    url: '/telemetry',
    query: {
      orderBy: 'invalid'
    }
  })

  assert.equal(res.statusCode, 400, "Invalid orderBy should return 400")

  res = await app.inject({
    url: '/telemetry',
    query: {
      orderBy: 'health_status'
    }
  })

  assert.equal(res.statusCode, 400, "Database column names should return 400")

  res = await app.inject({
    url: '/telemetry',
    query: {
      orderDirection: 'invalid'
    }
  })

  assert.equal(res.statusCode, 400, "Invalid orderDirection should return 400")

  res = await app.inject({
    url: '/telemetry',
    query: {
      status: 'invalid'
    }
  })

  assert.equal(res.statusCode, 400, "Invalid status should return 400")
})

test('orderBy status uses the public name', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)

  const res = await app.inject({
    url: '/telemetry',
    query: {
      orderBy: 'status',
      orderDirection: 'asc',
    }
  })

  assert.equal(res.statusCode, 200)
  assert.deepEqual(
    res.json<TelemetryBody[]>().map(record => record.status),
    ['anomaly', 'critical', 'healthy', 'healthy'],
  )
})

test('telemetry record by id', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)

  const res = await app.inject({
    url: '/telemetry/2'
  })

  assert.equal(res.statusCode, 200)
  const record = res.json<TelemetryBody>()
  assert.equal(record.id, 2)

  const resFields = Object.keys(record)
  requiredFields.forEach((key: string) => {
    assert.ok(resFields.includes(key), `Field ${key} is required`)
  })
})