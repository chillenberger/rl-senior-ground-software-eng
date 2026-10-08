/*
This api module provides the data access layer for the application.

I used axios to simplify the API calls and handle errors gracefully.
*/
import axios from 'axios'

export type HealthStatus = 'healthy' | 'anomaly' | 'critical'

export const HEALTH_STATUSES: readonly HealthStatus[] = ['healthy', 'anomaly', 'critical']

export type TelemetrySortColumn = 'satelliteId' | 'timestamp' | 'altitude' | 'velocity' | 'status'
export type TelemetrySortDirection = 'asc' | 'desc'

export type TelemetryRecord = {
  id: string
  satelliteId: string
  timestamp: string
  altitude: number
  velocity: number
  status: HealthStatus
}

export type TelemetryQuery = {
  satelliteId?: string
  status?: HealthStatus
  orderBy: TelemetrySortColumn
  orderDirection: TelemetrySortDirection
  limit: number
  offset: number
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
      ...(query.status ? { status: query.status } : {}),
    },
  })
  return response.data
}

export type CreateTelemetryInput = {
  satelliteId: string
  timestamp: string
  altitude: number
  velocity: number
  status: HealthStatus
}

export async function createTelemetry(telemetry: CreateTelemetryInput): Promise<TelemetryRecord> {
  const response = await client.post<TelemetryRecord>('/telemetry', telemetry)
  return response.data
}

export async function deleteTelemetry(id: string): Promise<void> {
  await client.delete(`/telemetry/${encodeURIComponent(id)}`)
}

export type LatestReading = {
  id: string
  timestamp: string
  altitude: number
  velocity: number
  status: HealthStatus
}

export type SatelliteSummary = {
  id: string
  operator: string
  createdAt: string
  updatedAt: string
  latestReading: LatestReading | null
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