
export class TelemetryConflictError extends Error {
  constructor (name: string) {
    super(`Telemetry record for ${name} already exists at this satellite and timestamp with a different value`)
    this.name = 'TelemetryConflictError'
  }
}

export class UnknownSatelliteError extends Error {
  constructor (satelliteId: string) {
    super(`Satellite ${satelliteId} not found`)
    this.name = 'UnknownSatelliteError'
  }
}

export class TelemetryRecordNotFoundError extends Error {
  constructor (id: string) {
    super(`Telemetry record ${id} not found`)
    this.name = 'TelemetryRecordNotFoundError'
  }
}

export class TelemetryParameterNotFoundError extends Error {
  constructor (name: string) {
    super(`Telemetry parameter ${name} not found`)
    this.name = 'TelemetryParameterNotFoundError'
  }
}

export class InvalidColumnError extends Error {
  constructor (column: string) {
    super(`Invalid column name: ${column}`)
    this.name = 'InvalidColumnError'
  }
}

export class TelemetryCheckFailedError extends Error {
  constructor (name: string, value: unknown) {
    super(`Check for ${name} failed: ${value}`)
    this.name = 'TelemetryCheckFailedError'
  }
}