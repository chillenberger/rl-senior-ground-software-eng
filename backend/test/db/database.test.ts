import { test } from 'node:test'
import * as assert from 'node:assert'
import Database from 'better-sqlite3'
import { 
  createTelemetryRecord,
  getTelemetryParameterByName,
  getTelemetryRecords, 
  getTelemetryRecordById, 
  deleteTelemetryRecordById,
  listSatellites,
} from '../../src/db/queries'
import { type TelemetryRecord } from '../../src/db/types'
import { isOutOfSpec, isValidValue } from '../../src/telemetry'
import { TelemetryCheckFailedError, TelemetryConflictError, TelemetryRecordNotFoundError } from '../../src/db/errors'
import { 
  clearDatabase,
  createTempDatabase,
  seedDatabase,
  testReadings 
} from '../helper'

function storedFields (record: TelemetryRecord) {
  const { id, createdAt, ...fields } = record
  return fields
}

function publicFields (reading: typeof testReadings[number]) {
  return {
    satelliteId: reading.satellite_id,
    parameterId: reading.parameter_id,
    timestamp: reading.timestamp,
    measurement: reading.measurement,
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

  await t.test('returns every seeded row', () => {
    const records = getTelemetryRecords(db)

    assert.equal(records.length, testReadings.length)
    assert.deepEqual(
      records.map(storedFields).sort(byTimestamp),
      testReadings.map(publicFields).toSorted(byTimestamp),
    )

    const generated = records.find(record => record.timestamp === '2026-09-25T16:20:00.000Z')
    assert.ok(generated)
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
      '2026-09-25T18:00:00.000Z',
    ])
  })

  await t.test('filters by health status', () => {
    const records = getTelemetryRecords(db, {
      filterBy: [{ name: 'measurement.name', value: 'health_status'}],
    })
    assert.equal(records.length, 3)
  })

  await t.test('combines filters', () => {
    const records = getTelemetryRecords(db, {
      filterBy: [{ name: 'measurement.name', value: 'health_status'}, { name: 'measurement.value', value: 'anomaly' }],
    })
    assert.deepEqual(records.map(storedFields), [
      publicFields(testReadings[2]),
      publicFields(testReadings[4]),
    ])
  })

  await t.test('orders by the public satelliteId and status names', () => {
    const bySatellite = getTelemetryRecords(db, {
      orderBy: 'satellite_id',
      orderDirection: 'asc',
    })
    assert.deepEqual(bySatellite.map(record => record.satelliteId), [
      'AURORA-3',
      'AURORA-3',
      'PHOTON-01',
      'PHOTON-01',
      'PHOTON-01',
    ])

    const byStatus = getTelemetryRecords(db, {
      filterBy: [{ name: 'measurement.name', value: 'health_status'}],
      orderBy: 'measurement.value',
      orderDirection: 'asc',
    })
    assert.deepEqual(byStatus.map(record => record.measurement.value), [
      'anomaly',
      'anomaly',
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
      '2026-09-25T18:00:00.000Z',
    ])

    const page = getTelemetryRecords(db, {
      orderBy: 'timestamp',
      orderDirection: 'desc',
      limit: 2,
      offset: 1,
    })
    assert.deepEqual(timestampsOf(page), [
      '2026-09-25T17:00:00.000Z',
      '2026-09-25T16:55:00.000Z',
    ])

    const offsetOnly = getTelemetryRecords(db, {
      orderBy: 'timestamp',
      orderDirection: 'asc',
      offset: 3,
    })
    assert.deepEqual(timestampsOf(offsetOnly), [
      '2026-09-25T17:00:00.000Z',
      '2026-09-25T18:00:00.000Z',
    ])

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
  clearDatabase(db)

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

test('createTelemetryRecord', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  const record = createTelemetryRecord(db, {
    satelliteId: 'PHOTON-01',
    timestamp: '2026-09-26T12:00:00Z',
    name: 'health_status', 
    value: 'healthy',
  })
  assert.equal(record.id, '6')
  assert.equal(record.timestamp, '2026-09-26T12:00:00.000Z')
  assert.equal(record.measurement.name, 'health_status')
  assert.equal(record.measurement.value, 'healthy')
})

test('applyTelemetryDefinition copies units from the telemetry parameter', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  const parameter = getTelemetryParameterByName(db, 'PHOTON-01', 'altitude')
  assert.ok(parameter)

  const measurement = { name: 'altitude', value: 200 }
  const units = parameter.definition?.units
  const oos = isOutOfSpec(parameter.definition?.spec, measurement)
  const isValid = isValidValue(parameter.definition?.check, measurement)
  if (!isValid) throw new TelemetryCheckFailedError(parameter.name, 200)

  const record = createTelemetryRecord(db, {
    satelliteId: 'PHOTON-01',
    timestamp: '2026-09-26T12:00:00Z',
    name: 'altitude',
    value: 200,
    oos,
    ...(units === undefined ? {} : { units }),
  })
  assert.equal(record.parameterId, parameter.id)
  assert.equal(record.measurement.name, 'altitude')
  assert.equal(record.measurement.value, 200)
  assert.equal(record.measurement.oos, false)
  assert.ok('units' in record.measurement)
  assert.equal(record.measurement.units, 'm')
})

test('getTelemetryParameterByName returns undefined for an unknown parameter', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  assert.equal(getTelemetryParameterByName(db, 'PHOTON-01', 'invalid'), undefined)
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
    name: 'health_status',
    value: 'healthy',
  })
  const replay = createTelemetryRecord(db, {
    ...reading,
    timestamp: '2026-09-26T12:00:00.000Z',
    name: 'health_status',
    value: 'healthy',
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

test('createTelemetryRecord keeps channels at the same instant independent', (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  const timestamp = '2026-09-26T12:00:00Z'
  const satelliteId = 'PHOTON-01'

  createTelemetryRecord(db, {
    satelliteId,
    timestamp,
    name: 'altitude',
    value: 100,
    units: 'm',
  })
  const current = createTelemetryRecord(db, {
    satelliteId,
    timestamp,
    name: 'current',
    value: 2,
    units: 'a',
  })
  const replay = createTelemetryRecord(db, {
    satelliteId,
    timestamp: '2026-09-26T12:00:00.000Z',
    name: 'current',
    value: 2,
    units: 'a',
  })

  assert.equal(replay.id, current.id)
  assert.equal(replay.measurement.name, 'current')
  assert.equal(replay.measurement.value, 2)
  assert.equal(
    getTelemetryRecords(db, { satelliteId })
      .filter(record => record.timestamp === '2026-09-26T12:00:00.000Z')
      .length,
    2,
  )
  assert.throws(
    () => createTelemetryRecord(db, {
      satelliteId,
      timestamp,
      name: 'current',
      value: 3,
      units: 'a',
    }),
    TelemetryConflictError,
  )
})

test('createTelemetryRecord rejects a different payload for the same instant', (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  const reading = {
    timestamp: '2026-09-26T12:00:00Z',
    satelliteId: 'PHOTON-01',
    name: 'health_status',
    value: 'healthy',
  }

  createTelemetryRecord(db, reading)
  assert.throws(
    () => createTelemetryRecord(db, { ...reading, name: 'health_status', value: 'anomaly' }),
    TelemetryConflictError,
  )
})

test('deleteTelemetryRecordById', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  deleteTelemetryRecordById(db, '2')
  assert.throws(
    () => getTelemetryRecordById(db, '2'),
    TelemetryRecordNotFoundError,
  )
})

test('listSatellites reports oos on the latest timestamp group', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  db.prepare(`
    INSERT INTO telemetry_parameters (satellite_id, name, derived, definition) VALUES
      ('AURORA-3', 'velocity', 0, '{"units": "m/s", "check": "velocity >= 0", "spec": "velocity > 0"}'),
      ('AURORA-3', 'altitude', 0, '{"units": "m", "check": "altitude >= 0", "spec": "altitude > 0"}')
  `).run()
  const parameterId = db.prepare(
    'SELECT id FROM telemetry_parameters WHERE satellite_id = ? AND name = ?',
  )
  const insertTelemetry = db.prepare(`
    INSERT INTO telemetry (satellite_id, parameter_id, timestamp, measurement)
    VALUES (?, ?, ?, ?)
  `)
  for (const [satelliteId, name, timestamp, measurement] of [
    ['PHOTON-01', 'altitude', '2026-09-25T18:00:00.000Z', '{"value": 100, "units": "m", "name": "altitude", "oos": true}'],
    ['AURORA-3', 'velocity', '2026-09-25T16:55:00.000Z', '{"value": 10, "units": "m/s", "name": "velocity", "oos": false}'],
    ['AURORA-3', 'altitude', '2026-09-25T16:00:00.000Z', '{"value": 1, "units": "m", "name": "altitude", "oos": true}'],
  ] as const) {
    const parameter = parameterId.get(satelliteId, name) as { id: number }
    insertTelemetry.run(satelliteId, parameter.id, timestamp, measurement)
  }

  const satellites = listSatellites(db)
  assert.deepEqual(satellites, [
    {
      id: 'AURORA-3',
      operator: 'Aurora Space',
      updatedAt: '2026-09-25T16:55:00.000Z',
      oos: false,
    },
    {
      id: 'PHOTON-01',
      operator: 'Rocket Lab',
      updatedAt: '2026-09-25T18:00:00.000Z',
      oos: true,
    },
  ])
})

test('one active telemetry parameter per satellite and name', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  const insert = db.prepare(`
    INSERT INTO telemetry_parameters (satellite_id, name, derived, definition)
    VALUES ('PHOTON-01', 'voltage', 0, '{"units": "v"}')
  `)

  assert.throws(
    () => insert.run(),
    (error: unknown) => error instanceof Database.SqliteError && error.code === 'SQLITE_CONSTRAINT_UNIQUE',
  )

  db.prepare(`
    UPDATE telemetry_parameters
    SET deprecated_at = '2026-09-01T00:00:00.000Z'
    WHERE satellite_id = 'PHOTON-01' AND name = 'voltage' AND deprecated_at IS NULL
  `).run()

  const created = insert.run()
  assert.equal(created.changes, 1)
  assert.throws(
    () => insert.run(),
    (error: unknown) => error instanceof Database.SqliteError && error.code === 'SQLITE_CONSTRAINT_UNIQUE',
  )
})