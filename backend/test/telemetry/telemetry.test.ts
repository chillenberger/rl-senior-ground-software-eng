import { test } from 'node:test'
import * as assert from 'node:assert'
import { computeString, ingestBulkTelemetry, ingestTelemetry } from '../../src/telemetry'
import { getTelemetryRecords } from '../../src/db/queries'

import { 
  // clearDatabase,
  createTempDatabase,
  seedDatabase,
} from '../helper'

test('gets the correct derived value', () => {
  const computation = 'voltage * current'
  const data = { voltage: 10, current: 2 }
  const result = computeString(computation, data)
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.value, 20)
})

test('gets incorrect derived value', () => {
  const computation = 'voltage * current'
  const data = { voltage: 10, height: 2 }
  const result = computeString(computation, data)
  assert.strictEqual(result.ok, false)
})

test('gets string derived value', () => {
  const computation = 'x == "bus_a" ? "primary" : "backup"'
  const data = { x: "bus_a" }
  const result = computeString(computation, data)
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.value, 'primary')

})

test('ingests telemetry', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)

  await t.test('ingests telemetry derives values', () => {
    ingestBulkTelemetry(db, {
      satelliteId: 'PHOTON-01',
      timestamp: '2026-09-25T16:05:00.000Z',
      data: {
        voltage: 10,
        current: 2,
      }
    })
    const records = getTelemetryRecords(db, {
      satelliteId: 'PHOTON-01',
      filterBy: [{ name: 'measurement.name', value: 'power' }],
    })
    console.log(records)
    assert.strictEqual(records.length, 1)
    assert.strictEqual(records[0].measurement.name, 'power')
    assert.strictEqual(records[0].measurement.value, 20)
  })

  await t.test('ingests telemetry does not derive values unknown', () => {
    ingestBulkTelemetry(db, {
      satelliteId: 'PHOTON-01',
      timestamp: '2026-09-25T16:00:00.001Z',
      data: {
        unknown: 'Not a telemetry parameter'
      }
    })
    const records = getTelemetryRecords(db, {
      satelliteId: 'PHOTON-01',
      filterBy: [{ name: 'timestamp', value: '2026-09-25T16:00:00.001Z' }],
    })
    assert.strictEqual(records.length, 0)
  })

})

test('single ingest waits until every derived input has arrived', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  const timestamp = '2026-09-25T16:10:00.000Z'
  const satelliteId = 'PHOTON-01'

  const voltage = ingestTelemetry(db, {
    satelliteId,
    timestamp,
    name: 'voltage',
    value: 10,
  })
  assert.strictEqual(voltage.measurement.name, 'voltage')
  assert.strictEqual(getTelemetryRecords(db, {
    satelliteId,
    filterBy: [{ name: 'timestamp', value: timestamp }],
  }).length, 1)

  const current = ingestTelemetry(db, {
    satelliteId,
    timestamp,
    name: 'current',
    value: 1,
  })
  assert.strictEqual(current.measurement.name, 'current')

  const records = getTelemetryRecords(db, {
    satelliteId,
    filterBy: [{ name: 'timestamp', value: timestamp }],
  })
  const byName = new Map(records.map(record => [record.measurement.name, record]))
  const power = byName.get('power')?.measurement
  assert.ok(power)
  assert.strictEqual(power.value, 10)
  assert.ok('units' in power)
  assert.strictEqual(power.units, 'w')
  assert.strictEqual(byName.get('health_status')?.measurement.value, 'healthy')
  assert.strictEqual(byName.get('health_status')?.measurement.oos, false)

  ingestTelemetry(db, {
    satelliteId,
    timestamp,
    name: 'current',
    value: 1,
  })
  assert.strictEqual(getTelemetryRecords(db, {
    satelliteId,
    filterBy: [{ name: 'timestamp', value: timestamp }, { name: 'measurement.name', value: 'power' }],
  }).length, 1)
})

test('single ingest does not join inputs from a different timestamp', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)

  ingestTelemetry(db, {
    satelliteId: 'PHOTON-01',
    timestamp: '2026-09-25T16:11:00.000Z',
    name: 'voltage',
    value: 10,
  })
  ingestTelemetry(db, {
    satelliteId: 'PHOTON-01',
    timestamp: '2026-09-25T16:11:00.001Z',
    name: 'current',
    value: 1,
  })

  const derived = getTelemetryRecords(db, {
    satelliteId: 'PHOTON-01',
    filterBy: [{ name: 'measurement.name', value: 'power' }],
  })
  assert.strictEqual(derived.length, 0)
})

test('single ingest treats zero as a present input', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  const timestamp = '2026-09-25T16:12:00.000Z'

  ingestTelemetry(db, {
    satelliteId: 'PHOTON-01',
    timestamp,
    name: 'voltage',
    value: 0,
  })
  ingestTelemetry(db, {
    satelliteId: 'PHOTON-01',
    timestamp,
    name: 'current',
    value: 0,
  })

  const records = getTelemetryRecords(db, {
    satelliteId: 'PHOTON-01',
    filterBy: [{ name: 'timestamp', value: timestamp }],
  })
  const byName = new Map(records.map(record => [record.measurement.name, record]))
  assert.strictEqual(byName.get('power')?.measurement.value, 0)
  assert.strictEqual(byName.get('health_status')?.measurement.value, 'anomaly')
})

test('derived telemetry runs the equation that is not deprecated', async (t) => {
  const db = createTempDatabase(t)
  seedDatabase(db)
  const satelliteId = 'PHOTON-01'
  const timestamp = '2026-09-25T16:20:00.000Z'

  db.prepare(`
    UPDATE telemetry_parameters
    SET deprecated_at = ?
    WHERE satellite_id = ? AND name = 'power' AND deprecated_at IS NULL
  `).run('2026-09-01T00:00:00.000Z', satelliteId)

  const current = db.prepare(`
    INSERT INTO telemetry_parameters (satellite_id, name, derived, definition)
    VALUES (?, 'power', 1, ?)
    RETURNING id
  `).get(
    satelliteId,
    JSON.stringify({ equation: 'voltage * current * 2', units: 'w' }),
  ) as { id: number }

  ingestTelemetry(db, { satelliteId, timestamp, name: 'voltage', value: 10 })
  ingestTelemetry(db, { satelliteId, timestamp, name: 'current', value: 2 })

  const records = getTelemetryRecords(db, {
    satelliteId,
    filterBy: [{ name: 'measurement.name', value: 'power' }],
  })
  assert.strictEqual(records.length, 1)
  assert.strictEqual(records[0].measurement.value, 40)
  assert.strictEqual(records[0].parameterId, current.id)
})