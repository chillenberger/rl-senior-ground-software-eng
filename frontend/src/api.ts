/*
This api module provides the data access layer for the application.

I used axios to simplify the API calls and handle errors gracefully.
*/
import axios from 'axios'

export type TelemetrySortColumn = 'timestamp' | 'measurement.value'
export type TelemetrySortDirection = 'asc' | 'desc'

export type TelemetryFilter = {
  name: string
  value: string
}

export type Measurement = {
  value: number | string
  name: string
  units: string | null
  oos?: boolean
}

export type TelemetryRecord = {
  id: string
  satelliteId: string
  timestamp: string
  measurement: Measurement
}

export type TelemetryQuery = {
  satelliteId?: string
  orderBy: TelemetrySortColumn
  orderDirection: TelemetrySortDirection
  limit: number
  offset: number
  filterBy: TelemetryFilter[]
}

const client = axios.create({
  baseURL: '/',
  timeout: 10_000,
})

export type TelemetryPage = {
  records: TelemetryRecord[]
  hasMore: boolean
}

export async function getTelemetry(query: TelemetryQuery, signal?: AbortSignal): Promise<TelemetryPage> {
  const response = await client.get<TelemetryPage>('/telemetry', {
    signal,
    params: {
      orderBy: query.orderBy,
      orderDirection: query.orderDirection,
      limit: query.limit,
      offset: query.offset,
      ...(query.satelliteId ? { satelliteId: query.satelliteId } : {}),
      ...(query.filterBy.length > 0
        ? { filterBy: query.filterBy.map((filter) => JSON.stringify(filter)) }
        : {}),
    },
    // Repeated filterBy keys, with no brackets, match the API's query parser.
    paramsSerializer: { indexes: null },
  })
  return response.data
}

export type CreateTelemetryInput = {
  satelliteId: string
  timestamp: string
  name: string
  value: number | string
}

export async function createTelemetry(telemetry: CreateTelemetryInput): Promise<TelemetryRecord> {
  const response = await client.post<TelemetryRecord>('/telemetry', telemetry)
  return response.data
}

export async function deleteTelemetry(id: string): Promise<void> {
  await client.delete(`/telemetry/${encodeURIComponent(id)}`)
}

export type SatelliteSummary = {
  id: string
  operator: string
  createdAt: string
  updatedAt: string | null
  oos: boolean | null
}

export async function getSatellites(signal?: AbortSignal): Promise<SatelliteSummary[]> {
  const response = await client.get<SatelliteSummary[]>('/satellites', { signal })
  return response.data
}

export function telemetryErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
      return data.message
    }
    if (!error.response) return 'Cannot reach the telemetry API'
  }
  if (error instanceof Error && error.message) return error.message
  return 'An unknown error occurred'
}

export async function apiHealth(): Promise<boolean> {
  try {
    const response = await client.get('/health')
    return response.status >= 200 && response.status < 300
  } catch {
    return false
  }
}

export async function getTelemetryParameters(satelliteId: string, signal?: AbortSignal): Promise<string[]> {
  const response = await client.get<string[]>(
    `/telemetry-parameters/${encodeURIComponent(satelliteId)}`,
    { signal },
  )
  return response.data
}