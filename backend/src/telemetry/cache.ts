// { measurementName: measurementValue, measurementName2: measurementValue2, ... }
export type Packet = Record<string, number | string>

type Derivable = {
  name: string
  required: string[]
}

export class TelemetryCache {
  // { satelliteId: { timestamp: packet}}}
  private packets = new Map<string, Map<string, Packet>>()

  // { satelliteId: number of telemetry parameters }
  private sizes = new Map<string, number>()

  setSize (satelliteId: string, size: number) {
    this.sizes.set(satelliteId, size)
  }

  getSize (satelliteId: string): number | undefined {
    return this.sizes.get(satelliteId)
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

  /*
  Walk derived parameters.
  Potential O() explosion, could use graphs if derived parameters are numerous
  */
  getReadyToDerived<Parameter extends Derivable, Result extends { value: number | string }> (
    parameters: Parameter[],
    packet: Packet,
    derive: (parameter: Parameter, packet: Packet) => Result | undefined,
  ): Result[] {
    const blocked = new Set<string>()
    const records: Result[] = []
    let progressed = true
    while (progressed) {
      progressed = false
      for (const parameter of parameters) {
        if (Object.hasOwn(packet, parameter.name) || blocked.has(parameter.name)) continue
        if (!parameter.required.every((name) => Object.hasOwn(packet, name))) continue

        const record = derive(parameter, packet)
        if (!record) {
          blocked.add(parameter.name)
          continue
        }
        records.push(record)
        packet[parameter.name] = record.value
        progressed = true
      }
    }
    return records
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
  }
}
