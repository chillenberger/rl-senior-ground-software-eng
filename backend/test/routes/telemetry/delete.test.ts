import { test } from 'node:test'
import * as assert from 'node:assert'
import { build, seedDatabase, testReadings } from '../../helper'
import { getTelemetryRecords } from '../../../src/db/queries'

test('delete telemetry record', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const index = 2
  const record = testReadings[index]
  if (!record) {
    throw new Error(`Telemetry record for index ${index} not found`)
  }

  const res = await app.inject({
    method: 'DELETE',
    url: `/telemetry/${record.id}`,
  })

  assert.equal(res.statusCode, 204)

  const records = getTelemetryRecords(app.db)
  assert.equal(records.length, testReadings.length - 1)
  assert.equal(records.find(reading => reading.id === record.id), undefined)
  assert.equal(res.payload, '')
})

test('delete then post recomputes derived telemetry', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const timestamp = '2026-09-26T12:00:00Z'
  const satelliteId = 'PHOTON-01'
  const post = (name: string, value: number) => app.inject({
    method: 'POST',
    url: '/telemetry',
    body: { timestamp, satelliteId, name, value },
  })

  assert.equal((await post('voltage', 10)).statusCode, 200)
  const current = await post('current', 1)
  assert.equal(current.statusCode, 200)
  assert.equal((await post('altitude', 100)).statusCode, 200)

  const deleted = await app.inject({
    method: 'DELETE',
    url: `/telemetry/${current.json<{ id: string }>().id}`,
  })
  assert.equal(deleted.statusCode, 204)

  const replaced = await post('current', 3)
  assert.equal(replaced.statusCode, 200)

  const records = getTelemetryRecords(app.db, { satelliteId })
    .filter((record) => record.timestamp === '2026-09-26T12:00:00.000Z')
  const byName = new Map(records.map((record) => [record.measurement.name, record]))
  assert.equal(byName.get('voltage')?.measurement.value, 10)
  assert.equal(byName.get('current')?.measurement.value, 3)
  assert.equal(byName.get('power')?.measurement.value, 30)
  assert.equal(byName.get('health_status')?.measurement.value, 'anomaly')
  assert.equal(records.filter((record) => record.measurement.name === 'power').length, 1)
  assert.equal(records.filter((record) => record.measurement.name === 'current').length, 1)
})

test('delete telemetry record not found', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const deleteId = '999'
  const res = await app.inject({
    method: 'DELETE',
    url: `/telemetry/${deleteId}`,
  })
  assert.equal(res.statusCode, 404)
  const body = res.json<{ message: string }>()
  assert.equal(body.message, `Telemetry record ${deleteId} not found`)
})
