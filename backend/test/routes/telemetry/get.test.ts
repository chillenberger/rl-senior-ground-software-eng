import { test } from 'node:test'
import * as assert from 'node:assert'
import { z } from 'zod'
import { build, seedDatabase, testReadings } from '../../helper'
import { MeasurementSchema } from '../../../src/db/types'

const requiredFields = ['id', 'timestamp', 'satelliteId', 'parameterId']

type TelemetryBody = {
  id: string
  timestamp: string
  satelliteId: string
  parameterId: number
  measurement: z.infer<typeof MeasurementSchema>
}

type TelemetryPage = {
  records: TelemetryBody[]
  hasMore: boolean
}

test('get telemetry records with filters', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const healthyPhoton = testReadings[2]

  const res = await app.inject({
    url: '/telemetry',
    query: {
      satelliteId: healthyPhoton.satellite_id,
      filterBy: [JSON.stringify({ name: 'measurement.name', value: 'health_status' })],
    }
  })

  assert.equal(res.statusCode, 200)
  const body = res.json<TelemetryPage>()

  assert.equal(body.hasMore, false)
  const records = body.records
  assert.equal(records.length, 1)
  assert.equal(records[0].satelliteId, healthyPhoton.satellite_id)
  assert.equal(records[0].measurement.value, healthyPhoton.measurement.value)
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
    query: { limit: '2', orderBy: 'id', orderDirection: 'asc' },
  })

  assert.equal(firstPage.statusCode, 200)
  const first = firstPage.json<TelemetryPage>()
  assert.equal(first.hasMore, true)
  assert.deepEqual(first.records.map(record => record.id), ['1', '2'])

  const lastPage = await app.inject({
    url: '/telemetry',
    query: { limit: '3', offset: '2', orderBy: 'id', orderDirection: 'asc' },
  })

  assert.equal(lastPage.statusCode, 200)
  const last = lastPage.json<TelemetryPage>()
  assert.equal(last.hasMore, false)
  assert.deepEqual(last.records.map(record => record.id), ['3', '4', '5'])

  const exactPage = await app.inject({
    url: '/telemetry',
    query: { limit: '5' },
  })

  assert.equal(exactPage.statusCode, 200)
  const exact = exactPage.json<TelemetryPage>()
  assert.equal(exact.hasMore, false)
  assert.equal(exact.records.length, 5)
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
      filterBy: [JSON.stringify({ name: 'not_a_column', value: 'x' })],
    }
  })

  assert.equal(res.statusCode, 400, "Invalid filter column should return 400")

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
      orderBy: "(CASE WHEN satellite_id = 'PHOTON-01' THEN 0 ELSE 1 END)",
    }
  })

  assert.equal(res.statusCode, 400, "orderBy expressions should return 400")

  res = await app.inject({
    url: '/telemetry',
    query: {
      filterBy: [JSON.stringify({ name: '1 OR satellite_id', value: 'x' })],
    }
  })

  assert.equal(res.statusCode, 400, "filter expressions should return 400")

  res = await app.inject({
    url: '/telemetry',
    query: {
      orderDirection: 'invalid'
    }
  })

  assert.equal(res.statusCode, 400, "Invalid orderDirection should return 400")
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
  const id = testReadings.length + 1
  const res = await app.inject({
    url: `/telemetry/${id}`
  })
  assert.equal(res.statusCode, 404)
  const body = res.json<{ message: string }>()
  assert.equal(body.message, `Telemetry record ${id} not found`)
})
