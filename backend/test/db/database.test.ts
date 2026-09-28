import { test } from 'node:test'
import * as assert from 'node:assert'
import { 
  createTelemetryRecord, 
  getTelemetryRecords, 
  getTelemetryRecordById, 
  TelemetryConflictError, 
  TelemetryRecordNotFoundError, 
  type TelemetryRecord 
} from '../../src/db/queries'
import { createTempDatabase, seedDatabase, testReadings } from '../helper'

function storedFields (record: TelemetryRecord) {
  const { id, createdAt, ...fields } = record
  return fields
}

function publicFields (reading: typeof testReadings[number]) {
  return {
    satelliteId: reading.satellite_id,
    latitude: reading.latitude,
    longitude: reading.longitude,
    timestamp: reading.timestamp,
    altitude: reading.altitude,
    velocity: reading.velocity,
    status: reading.health_status,
  }
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
      testReadings.map(publicFields).toSorted(byTimestamp),
    )

    const generated = records.find(record => record.timestamp === '2026-09-25T16:20:00.000Z')
    assert.ok(generated)
    assert.equal(generated.latitude, null)
    assert.equal(generated.longitude, null)
    assert.equal(typeof generated.id, 'string')
    assert.equal(typeof generated.createdAt, 'string')
    assert.ok(generated.createdAt.length > 0)
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
      publicFields(testReadings[3]),
    ])
  })

  await t.test('combines filters', () => {
    const records = getTelemetryRecords(db, {
      satelliteId: 'PHOTON-01',
      status: 'anomaly',
    })
    assert.deepEqual(records.map(storedFields), [publicFields(testReadings[1])])
  })

  await t.test('orders by the public satelliteId and status names', () => {
    const bySatellite = getTelemetryRecords(db, {
      orderBy: 'satelliteId',
      orderDirection: 'asc',
    })
    assert.deepEqual(bySatellite.map(record => record.satelliteId), [
      'AURORA-3',
      'AURORA-3',
      'PHOTON-01',
      'PHOTON-01',
    ])

    const byStatus = getTelemetryRecords(db, {
      orderBy: 'status',
      orderDirection: 'asc',
    })
    assert.deepEqual(byStatus.map(record => record.status), [
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
  assert.equal(record.id, '2')
})

test('getTelemetryRecordById on missing record', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  assert.throws(
    () => getTelemetryRecordById(db, '999'),
    (error: unknown) => error instanceof TelemetryRecordNotFoundError
      && error.message === 'Telemetry record 999 not found',
  )
})

test('createTelemetryRecord returns the existing row for the same satellite and instant', (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  const reading = {
    satelliteId: 'PHOTON-01',
    status: 'healthy' as const,
    altitude: 100,
    velocity: 10,
  }

  const created = createTelemetryRecord(db, {
    ...reading,
    timestamp: '2026-09-26T12:00:00Z',
  })
  const replay = createTelemetryRecord(db, {
    ...reading,
    timestamp: '2026-09-26T12:00:00.000Z',
  })

  assert.equal(replay.id, created.id)
  assert.equal(replay.timestamp, '2026-09-26T12:00:00.000Z')
  assert.equal(
    getTelemetryRecords(db, { satelliteId: 'PHOTON-01' })
      .filter(record => record.timestamp === '2026-09-26T12:00:00.000Z')
      .length,
    1,
  )
})

test('createTelemetryRecord rejects a different payload for the same instant', (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  const reading = {
    timestamp: '2026-09-26T12:00:00Z',
    satelliteId: 'PHOTON-01',
    status: 'healthy' as const,
    altitude: 100,
    velocity: 10,
  }

  createTelemetryRecord(db, reading)
  assert.throws(
    () => createTelemetryRecord(db, { ...reading, altitude: 200 }),
    TelemetryConflictError,
  )
})