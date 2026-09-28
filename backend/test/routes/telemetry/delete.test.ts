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

test('delete telemetry record not found', async (t) => {
  const app = await build(t)
  seedDatabase(app.db)
  const deleteId = '5'
  const res = await app.inject({
    method: 'DELETE',
    url: `/telemetry/${deleteId}`,
  })
  assert.equal(res.statusCode, 404)
  const body = res.json<{ message: string }>()
  assert.equal(body.message, `Telemetry record ${deleteId} not found`)
})
