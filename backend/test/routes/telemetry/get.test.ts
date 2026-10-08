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

type TelemetryPage = {
  records: TelemetryBody[]
  hasMore: boolean
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
  const body = res.json<TelemetryPage>()
  assert.equal(body.hasMore, false)
  const records = body.records
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
  const body = res.json<TelemetryPage>()
  assert.equal(body.hasMore, false)
  assert.equal(body.records.length, testReadings.length)
})

test('limit reports whether another page exists', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)

  const firstPage = await app.inject({
    url: '/telemetry',
    query: { limit: '2' },
  })

  assert.equal(firstPage.statusCode, 200)
  const first = firstPage.json<TelemetryPage>()
  assert.equal(first.hasMore, true)
  assert.deepEqual(first.records.map(record => record.id), ['2', '4'])

  const lastPage = await app.inject({
    url: '/telemetry',
    query: { limit: '2', offset: '2' },
  })

  assert.equal(lastPage.statusCode, 200)
  const last = lastPage.json<TelemetryPage>()
  assert.equal(last.hasMore, false)
  assert.deepEqual(last.records.map(record => record.id), ['3', '1'])

  const exactPage = await app.inject({
    url: '/telemetry',
    query: { limit: '4' },
  })

  assert.equal(exactPage.statusCode, 200)
  const exact = exactPage.json<TelemetryPage>()
  assert.equal(exact.hasMore, false)
  assert.equal(exact.records.length, 4)
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

test('orderBy altitude and velocity', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)

  const byAltitude = await app.inject({
    url: '/telemetry',
    query: {
      orderBy: 'altitude',
      orderDirection: 'asc',
    },
  })

  assert.equal(byAltitude.statusCode, 200)
  assert.deepEqual(
    byAltitude.json<TelemetryPage>().records.map(record => record.altitude),
    [450000, 500000, 510000, 700000],
  )

  const byVelocity = await app.inject({
    url: '/telemetry',
    query: {
      orderBy: 'velocity',
      orderDirection: 'desc',
    },
  })

  assert.equal(byVelocity.statusCode, 200)
  assert.deepEqual(
    byVelocity.json<TelemetryPage>().records.map(record => record.velocity),
    [8, 7.5, 7, 6.5],
  )
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
    res.json<TelemetryPage>().records.map(record => record.status),
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

test('telemetry record by id not found', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const res = await app.inject({
    url: '/telemetry/5'
  })
  assert.equal(res.statusCode, 404)
  const body = res.json<{ message: string }>()
  assert.equal(body.message, 'Telemetry record 5 not found')
})
