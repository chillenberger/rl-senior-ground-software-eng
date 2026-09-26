import { test } from 'node:test'
import * as assert from 'node:assert'
import { getTelemetryRecords, getTelemetryRecordById, type TelemetryRecord } from '../../src/db/database'
import { createTempDatabase, seedDatabase, testReadings } from '../helper'

function storedFields (record: TelemetryRecord) {
  const { id, created_at, ...fields } = record
  return fields
}

function byTimestamp<T extends { timestamp: string }> (left: T, right: T): number {
  return left.timestamp < right.timestamp ? -1 : left.timestamp > right.timestamp ? 1 : 0
}

function timestampsOf (records: TelemetryRecord[]): string[] {
  return records.map(record => record.timestamp)
}

test('getTelemetryRecords', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)

  await t.test('returns every seeded row, including null coordinates', () => {
    const records = getTelemetryRecords(db)

    assert.equal(records.length, testReadings.length)
    assert.deepEqual(
      records.map(storedFields).sort(byTimestamp),
      testReadings.toSorted(byTimestamp),
    )

    const generated = records.find(record => record.timestamp === '2026-09-25T16:20:00.000Z')
    assert.ok(generated)
    assert.equal(generated.latitude, null)
    assert.equal(generated.longitude, null)
    assert.equal(typeof generated.id, 'number')
    assert.equal(typeof generated.created_at, 'string')
    assert.ok(generated.created_at.length > 0)
  })

  await t.test('ignores a filter object when no fields are set', () => {
    const records = getTelemetryRecords(db, {
      satelliteId: undefined
    })
    assert.equal(records.length, testReadings.length)
  })

  await t.test('filters by satellite id', () => {
    const records = getTelemetryRecords(db, {
      satelliteId: 'PHOTON-01',
      orderBy: 'timestamp',
      orderDirection: 'asc',
    })
    assert.deepEqual(timestampsOf(records), [
      '2026-09-25T16:00:00.000Z',
      '2026-09-25T17:00:00.000Z',
    ])
  })

  await t.test('filters by health status', () => {
    const records = getTelemetryRecords(db, {
      status: 'critical',
    })
    assert.deepEqual(records.map(storedFields), [
      testReadings[3],
    ])
  })

  await t.test('combines filters', () => {
    const records = getTelemetryRecords(db, {
      satelliteId: 'PHOTON-01',
      status: 'anomaly',
    })
    assert.deepEqual(records.map(storedFields), [testReadings[1]])
  })

  await t.test('orders by the public satelliteId and status names', () => {
    const bySatellite = getTelemetryRecords(db, {
      orderBy: 'satelliteId',
      orderDirection: 'asc',
    })
    assert.deepEqual(bySatellite.map(record => record.satellite_id), [
      'AURORA-3',
      'AURORA-3',
      'PHOTON-01',
      'PHOTON-01',
    ])

    const byStatus = getTelemetryRecords(db, {
      orderBy: 'status',
      orderDirection: 'asc',
    })
    assert.deepEqual(byStatus.map(record => record.health_status), [
      'anomaly',
      'critical',
      'healthy',
      'healthy',
    ])
  })

  await t.test('sorts and paginates', () => {
    const ascending = getTelemetryRecords(db, {
      orderBy: 'timestamp',
      orderDirection: 'asc',
    })
    assert.deepEqual(timestampsOf(ascending), [
      '2026-09-25T16:00:00.000Z',
      '2026-09-25T16:20:00.000Z',
      '2026-09-25T16:55:00.000Z',
      '2026-09-25T17:00:00.000Z',
    ])

    const page = getTelemetryRecords(db, {
      orderBy: 'timestamp',
      orderDirection: 'desc',
      limit: 2,
      offset: 1,
    })
    assert.deepEqual(timestampsOf(page), [
      '2026-09-25T16:55:00.000Z',
      '2026-09-25T16:20:00.000Z',
    ])

    const offsetOnly = getTelemetryRecords(db, {
      orderBy: 'timestamp',
      orderDirection: 'asc',
      offset: 3,
    })
    assert.deepEqual(timestampsOf(offsetOnly), ['2026-09-25T17:00:00.000Z'])

    const emptyPage = getTelemetryRecords(db, { limit: 0 })
    assert.deepEqual(emptyPage, [])
  })

  await t.test('returns an empty list when nothing matches', () => {
    const records = getTelemetryRecords(db, { satelliteId: 'MISSING' })
    assert.deepEqual(records, [])
  })
})

test('getTelemetryRecords on an empty database', (t) => {
  const db = createTempDatabase(t)

  assert.deepEqual(getTelemetryRecords(db), [])
})

test('getTelemetryRecordById', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  const record = getTelemetryRecordById(db, '2')
  assert.ok(record)
  assert.deepEqual(record.id, 2)
})

test('getTelemetryRecordById on missing record', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  const record = getTelemetryRecordById(db, '999')
  assert.deepEqual(record, null)
})