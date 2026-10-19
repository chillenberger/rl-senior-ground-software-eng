import { Parser, type Expression } from 'expr-eval'
import { 
  getTelemetryParameters, 
  getTelemetryRecords,
  createTelemetryRecord, 
  getTelemetryParameterByName, 
  getTelemetryParameterCount,
  getTelemetryRecordById,
  deleteTelemetryRecordById,
} from '../db/queries'
import { SqliteDatabase } from '../db/database'
import { CreateTelemetryRecord, type TelemetryDefinition } from '../db/types'
import { TelemetryCheckFailedError, TelemetryParameterNotFoundError } from '../db/errors'
import { z } from 'zod'
import { TelemetryCache, type Packet } from './cache'

const telemetryCache = new TelemetryCache()
const parser = new Parser()
const derivedValueSchema = z.number().or(z.string())

type DerivedParameter = {
  name: string
  definition: TelemetryDefinition
  required: string[]
  expression: Expression
}

function computeString(equation: string, data: Record<string, number | string>): {ok: true, value: unknown} | {ok: false, error: string} {
  try {
    const solution = parser.parse(equation).evaluate(data) as unknown;
    return { ok: true, value: solution };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export function isOutOfSpec (
  specification: string | null | undefined,
  measurement: { name: string, value: number | string },
): boolean {
  if (specification == null) return false
  const result = computeString(specification, {
    [measurement.name]: measurement.value,
  })
  if (!result.ok) {
    throw new Error(`Failed to compute specification for ${measurement.name}: ${result.error}`)
  }
  return result.value !== true
}

export function isValidValue (
  valueCheck: string | null | undefined,
  measurement: { name: string, value: number | string },
): boolean {
  if (valueCheck == null) return true
  const result = computeString(valueCheck, {
    [measurement.name]: measurement.value,
  })
  if (!result.ok) {
    throw new Error(`Failed to compute value check for ${measurement.name}: ${result.error}`)
  }
  return result.value === true
}

function derivedParameters (db: SqliteDatabase, satelliteId: string): DerivedParameter[] {
  const parameters: DerivedParameter[] = []
  for (const parameter of getTelemetryParameters(db, satelliteId)) {
    if (!parameter.derived || parameter.definition === null) continue
    const equation = parameter.definition.equation
    if (!equation) continue

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

function dependentDerivedNames (parameters: DerivedParameter[], root: string): string[] {
  const removed = new Set<string>([root])
  let progressed = true
  while (progressed) {
    progressed = false
    for (const parameter of parameters) {
      if (removed.has(parameter.name)) continue
      if (parameter.required.some((name) => removed.has(name))) {
        removed.add(parameter.name)
        progressed = true
      }
    }
  }
  removed.delete(root)
  return [...removed]
}

/*
The cache holds a packet that is still arriving.
Once that packet is pruned, the rows stored for the timestamp are the inputs.
*/
function measurementPacket (db: SqliteDatabase, satelliteId: string, timestamp: string): Packet {
  const cached = telemetryCache.get(satelliteId, timestamp)
  if (cached !== undefined) return cached

  const packet: Packet = {}
  for (const record of getTelemetryRecords(db, {
    satelliteId,
    filterBy: [{ name: 'timestamp', value: timestamp }],
  })) {
    packet[record.measurement.name] = record.measurement.value
  }
  return packet
}

function createDerivedRecord (
  satelliteId: string,
  timestamp: string,
  packet: Packet,
  parameter: DerivedParameter,
): CreateTelemetryRecord | undefined {
  const inputs: Packet = {}
  for (const name of parameter.required) {
    const value = packet[name]
    if (value === undefined) return
    inputs[name] = value
  }

  let evaluated: unknown
  try {
    evaluated = parameter.expression.evaluate(inputs) as unknown
  } catch (error) {
    console.error(error)
    return
  }

  const parsedValue = derivedValueSchema.safeParse(evaluated)
  if (!parsedValue.success) return

  try {
    const measurement = { name: parameter.name, value: parsedValue.data }
    const units = parameter.definition.units
    const oos = isOutOfSpec(parameter.definition.spec, measurement)
    return {
      name: parameter.name,
      timestamp,
      satelliteId,
      value: parsedValue.data,
      ...(units === undefined ? {} : { units }),
      ...(oos ? { oos: true } : {}),
    }

  } catch (error) {
    console.error(error)
    return
  }
}

function ingestTelemetry(db: SqliteDatabase, data: {satelliteId: string, timestamp: string, name: string, value: number | string}) {
  const parameter = getTelemetryParameterByName(db, data.satelliteId, data.name)
  
  // Reject unknown ingested parameters 
  if (!parameter) throw new TelemetryParameterNotFoundError(data.name)

  const measurement = { name: parameter.name, value: data.value }
  const units = parameter.definition?.units
  const oos = isOutOfSpec(parameter.definition?.spec, measurement)
  const isValid = isValidValue(parameter.definition?.check, measurement)

  if (!isValid) throw new TelemetryCheckFailedError(parameter.name, data.value)

  const record = createTelemetryRecord(db, {
    satelliteId: data.satelliteId,
    timestamp: data.timestamp,
    name: data.name,
    value: data.value,
    oos,
    ...(units === undefined ? {} : { units }),
  })
  const parameters = derivedParameters(db, record.satelliteId)
  const packet = measurementPacket(db, record.satelliteId, record.timestamp)
  packet[record.measurement.name] = record.measurement.value
  for (const name of dependentDerivedNames(parameters, record.measurement.name)) {
    delete packet[name]
  }
  if (!telemetryCache.getSize(record.satelliteId)) {
    telemetryCache.setSize(record.satelliteId, getTelemetryParameterCount(db, record.satelliteId))
  }
  telemetryCache.setPacket(record.satelliteId, record.timestamp, packet)

  const readyToDerived = telemetryCache.getReadyToDerived(
    parameters,
    packet,
    (parameter, current) => createDerivedRecord(record.satelliteId, record.timestamp, current, parameter),
  )
  for (const derived of readyToDerived) {
    createTelemetryRecord(db, derived, { replaceOnConflict: true })
  }

  telemetryCache.setPacket(record.satelliteId, record.timestamp, packet)
  telemetryCache.prune()
  return record
}

function deleteTelemetry (db: SqliteDatabase, id: string): void {
  const record = getTelemetryRecordById(db, id)
  deleteTelemetryRecordById(db, id)
  telemetryCache.remove(record.satelliteId, record.timestamp, record.measurement.name)
}

function ingestBulkTelemetry(db: SqliteDatabase, data: {satelliteId: string, timestamp: string, data: Record<string, number | string>}) {
  const telemetryParameters = getTelemetryParameters(db, data.satelliteId)
  telemetryCache.setSize(data.satelliteId, telemetryParameters.length)
  
  // Add all new raw telemetry to the database
  for (const telemetryParameter of telemetryParameters) {
    const definition = telemetryParameter.definition
    if (definition === null) continue

    const telemetry: number | string = data.data[telemetryParameter.name]

    let telemetryName: string;
    let telemetryValue: number | string;

    if (definition.equation) {
      const value = computeString(definition.equation, data.data)
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

    const measurement = { name: telemetryName, value: telemetryValue }
    const units = definition.units
    const oos = isOutOfSpec(definition.spec, measurement)

    createTelemetryRecord(db, {
      satelliteId: data.satelliteId,
      timestamp: data.timestamp,
      name: telemetryName,
      value: telemetryValue,
      oos,
      ...(units === undefined ? {} : { units }),
    })

    const packet = telemetryCache.set(data.satelliteId, data.timestamp, telemetryName, telemetryValue)
    const readyDerived = telemetryCache.getReadyToDerived(
      derivedParameters(db, data.satelliteId),
      packet,
      (parameter, current) => createDerivedRecord(data.satelliteId, data.timestamp, current, parameter),
    )
    for (const record of readyDerived) {
      createTelemetryRecord(db, record)
    }
  }
  telemetryCache.prune()
}

function clearTelemetryCache () {
  telemetryCache.clear()
}

export { ingestBulkTelemetry, ingestTelemetry, deleteTelemetry, clearTelemetryCache, computeString };
