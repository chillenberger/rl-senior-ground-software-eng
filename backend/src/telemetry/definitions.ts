import { Parser, type Expression } from 'expr-eval'
import { getTelemetryParameters, createTelemetryRecord, getTelemetryParameterByName, getTelemetryParameterCount } from '../db/queries'
import { SqliteDatabase } from '../db/database'
import { TelemetryCheckFailedError, TelemetryParameterNotFoundError } from '../db/errors'
import { z } from 'zod'

// { measurementName: measurementValue, measurementName2: measurementValue2, ... }
type Packet = Record<string, number | string>

class TelemetryCache {
  // { satelliteId: { timestamp: packet}}}
  private packets = new Map<string, Map<string, Packet>>()

  // { satelliteId: number of telemetry parameters }
  private sizes = new Map<string, number>()

  setSize (satelliteId: string, size: number) {
    this.sizes.set(satelliteId, size)
  }

  set (satelliteId: string, timestamp: string, name: string, value: number | string): Packet {
    let byTimestamp = this.packets.get(satelliteId)
    if (byTimestamp === undefined) {
      byTimestamp = new Map()
      this.packets.set(satelliteId, byTimestamp)
    }

    let packet = byTimestamp.get(timestamp)
    if (packet === undefined) {
      packet = {}
      byTimestamp.set(timestamp, packet)
    }

    packet[name] = value
    return packet
  }

  prune () {
    for (const [satelliteId, byTimestamp] of this.packets) {
      const parameterCount = this.sizes.get(satelliteId)
      for (const [packetTimestamp, packet] of byTimestamp) {
        if (parameterCount !== undefined && Object.keys(packet).length === parameterCount) {
          byTimestamp.delete(packetTimestamp)
        }
      }
      if (byTimestamp.size === 0) this.packets.delete(satelliteId)
    }
  }

  clear () {
    this.packets.clear()
    this.sizes.clear()
  }
}

const telemetryCache = new TelemetryCache()
const parser = new Parser()
const derivedValueSchema = z.number().or(z.string())

type DerivedParameter = {
  name: string
  definition: string
  required: string[]
  expression: Expression
}

function computeDerivedValue(computation: string, data: Record<string, number | string>): {ok: true, value: unknown} | {ok: false, error: string} {
  try {
    const res = new Parser().parse(computation).evaluate(data);
    return { ok: true, value: res };
  } catch (error) {
    console.error(error);
    return { ok: false, error: (error as Error).message };
  }
}

function readDefinitionField (
  definition: string,
  key: 'check' | 'spec' | 'units' | 'equation',
): string | undefined {
  const parsed = JSON.parse(definition) as Partial<Record<typeof key, unknown>>
  const field = parsed[key]
  return typeof field === 'string' ? field : undefined
}

function predicateHolds (
  label: 'check' | 'spec',
  expression: string,
  measurement: { name: string, value: number | string },
): boolean {
  const result = computeDerivedValue(expression, {
    [measurement.name]: measurement.value,
  })
  if (!result.ok) {
    throw new Error(`Failed to compute ${label} for ${measurement.name}: ${result.error}`)
  }
  return result.value === true
}

export function applyTelemetryDefinition (
  definition: string | null,
  measurement: { name: string, value: number | string },
): { units: string | undefined, oos: boolean } {
  let oos = false
  let units: string | undefined
  if (definition !== null) {
    const check = readDefinitionField(definition, 'check')
    if (check !== undefined && !predicateHolds('check', check, measurement)) {
      throw new TelemetryCheckFailedError(measurement.name, measurement.value)
    }

    const spec = readDefinitionField(definition, 'spec')
    if (spec !== undefined && !predicateHolds('spec', spec, measurement)) {
      oos = true
    }

    units = readDefinitionField(definition, 'units')
  }

  return { units, oos }
}

function ingestBulkTelemetry(db: SqliteDatabase, data: {satelliteId: string, timestamp: string, data: Record<string, number | string>}) {
  const telemetryParameters = getTelemetryParameters(db, data.satelliteId)
  telemetryCache.setSize(data.satelliteId, getTelemetryParameterCount(db, data.satelliteId))
  
  // Add all new raw telemetry to the database
  for (const telemetryParameter of telemetryParameters) {
    if (telemetryParameter.definition === null) continue

    const telemetry: number | string = data.data[telemetryParameter.name]
    const definition = JSON.parse(telemetryParameter.definition)

    let telemetryName: string;
    let telemetryValue: number | string;

    if (definition.equation) {
      const value = computeDerivedValue(definition.equation, data.data)
      if (!value.ok) continue

      const parsedValue = z.number().or(z.string()).safeParse(value.value)
      if (!parsedValue.success) continue

      telemetryName = telemetryParameter.name;
      telemetryValue = parsedValue.data;
    } else if (typeof telemetry === 'number' && typeof definition.units === 'string') {
      telemetryName = telemetryParameter.name;
      telemetryValue = telemetry;
    } else if (typeof telemetry === 'string') {
      telemetryName = telemetryParameter.name;
      telemetryValue = telemetry;
    } else {
      continue;
    }
    const { units, oos } = applyTelemetryDefinition(telemetryParameter.definition, { name: telemetryName, value: telemetryValue })
    createTelemetryRecord(db, {
      satelliteId: data.satelliteId,
      timestamp: data.timestamp,
      name: telemetryName,
      value: telemetryValue,
      oos,
      ...(units === undefined ? {} : { units }),
    })

    let packet = telemetryCache.set(data.satelliteId, data.timestamp, telemetryName, telemetryValue)

    // Potential O() explosion, could use graphs if derived parameters are numerous
    writeReadyDerived(db, data.satelliteId, data.timestamp, packet)
  }
  telemetryCache.prune()
}

function derivedParameters (db: SqliteDatabase, satelliteId: string): DerivedParameter[] {
  const parameters: DerivedParameter[] = []
  for (const parameter of getTelemetryParameters(db, satelliteId)) {
    if (!parameter.derived || parameter.definition === null) continue
    const equation = readDefinitionField(parameter.definition, 'equation')
    if (equation === undefined) continue

    let expression: Expression
    try {
      expression = parser.parse(equation)
    } catch (error) {
      console.error(error)
      continue
    }

    parameters.push({
      name: parameter.name,
      definition: parameter.definition,
      required: expression.variables(),
      expression,
    })
  }
  return parameters
}

// Write a derived parameter to the database
function storeDerived (
  db: SqliteDatabase,
  satelliteId: string,
  timestamp: string,
  packet: Packet,
  parameter: DerivedParameter,
): boolean {
  const inputs: Packet = {}
  for (const name of parameter.required) {
    const value = packet[name]
    if (value === undefined) return false
    inputs[name] = value
  }

  let evaluated: unknown
  try {
    evaluated = parameter.expression.evaluate(inputs)
  } catch (error) {
    console.error(error)
    return false
  }

  const parsedValue = derivedValueSchema.safeParse(evaluated)
  if (!parsedValue.success) return false

  try {
    const { units, oos } = applyTelemetryDefinition(parameter.definition, {
      name: parameter.name,
      value: parsedValue.data,
    })
    createTelemetryRecord(db, {
      satelliteId,
      timestamp,
      name: parameter.name,
      value: parsedValue.data,
      oos,
      ...(units === undefined ? {} : { units }),
    })
  } catch (error) {
    console.error(error)
    return false
  }

  packet[parameter.name] = parsedValue.data
  return true
}

// Determine which derived parameters are ready to be written and write them
function writeReadyDerived (
  db: SqliteDatabase,
  satelliteId: string,
  timestamp: string,
  packet: Packet,
) {
  const derived = derivedParameters(db, satelliteId)
  const blocked = new Set<string>()
  let progressed = true
  while (progressed) {
    progressed = false
    for (const parameter of derived) {
      if (Object.hasOwn(packet, parameter.name) || blocked.has(parameter.name)) continue
      if (!parameter.required.every((name) => Object.hasOwn(packet, name))) continue
      if (!storeDerived(db, satelliteId, timestamp, packet, parameter)) {
        blocked.add(parameter.name)
        continue
      }
      progressed = true
    }
  }
}

function ingestTelemetry(db: SqliteDatabase, data: {satelliteId: string, timestamp: string, name: string, value: number | string}) {
  const telemetryParameter = getTelemetryParameterByName(db, data.satelliteId, data.name)
  if (!telemetryParameter) throw new TelemetryParameterNotFoundError(data.name)
  const { units, oos } = applyTelemetryDefinition(telemetryParameter.definition, { name: data.name, value: data.value })

  // Write new raw data
  const record = createTelemetryRecord(db, {
    satelliteId: data.satelliteId,
    timestamp: data.timestamp,
    name: data.name,
    value: data.value,
    oos,
    ...(units === undefined ? {} : { units }),
  })

  telemetryCache.setSize(record.satelliteId, getTelemetryParameterCount(db, record.satelliteId))
  const packet = telemetryCache.set(record.satelliteId, record.timestamp, data.name, data.value)

  // Evaluate and write any new derivable parameters
  writeReadyDerived(db, record.satelliteId, record.timestamp, packet)
  telemetryCache.prune()
  return record
}

function clearTelemetryCache () {
  telemetryCache.clear()
}

export { computeDerivedValue, ingestBulkTelemetry, ingestTelemetry, clearTelemetryCache };
