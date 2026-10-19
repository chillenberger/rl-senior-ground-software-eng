/*
This hook provides centralizes all Telemetry data management in one place.
This makes it simple to understand and easily extendable in the future.
*/
import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import {
  getTelemetry,
  telemetryErrorMessage,
  deleteTelemetry,
  createTelemetry,
  type CreateTelemetryInput,
  type TelemetryRecord,
  type TelemetrySortColumn,
  type TelemetrySortDirection,
} from '../api'

export type { TelemetryRecord, TelemetrySortColumn, TelemetrySortDirection }

const PAGE_SIZE = 10

export function useTelemetry() {
  const [records, setRecords] = useState<TelemetryRecord[]>([])
  const [satelliteId, setSatelliteId] = useState('')
  // const [status, setStatus] = useState<HealthStatus | ''>('')
  const [sortColumn, setSortColumn] = useState<TelemetrySortColumn>('timestamp')
  const [sortDirection, setSortDirection] = useState<TelemetrySortDirection>('desc')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const requestId = useRef(0)
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(new Set())

  /* 
  Load initial telemetry records.

  Reload on changes to satellite id, status, sort column, or sort direction.
  Reload when triggered by refreshToken.
  */
  useEffect(() => {
    // Use AbortController to ensure we cleanup api call on unmount. 
    const controller = new AbortController()
    const request = ++requestId.current

    const load = async () => {
      setLoading(true)
      setLoadingMore(false)
      setError(null)
      setRecords([])
      setHasMore(false)
      try {
        const page = await getTelemetry({
          satelliteId: satelliteId || undefined,
          // status: status || undefined,
          orderBy: sortColumn,
          orderDirection: sortDirection,
          limit: PAGE_SIZE,
          offset: 0,
          filterBy: {},
        }, controller.signal)
        if (requestId.current !== request) return
        setRecords(page.records)
        setHasMore(page.hasMore)
      } catch (error) {
        if (axios.isAxiosError(error) && error.code === 'ERR_CANCELED') return
        if (requestId.current !== request) return
        setError(telemetryErrorMessage(error))
      } finally {
        if (requestId.current === request && !controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [satelliteId, status, sortColumn, sortDirection, refreshToken])

  function setSort(column: TelemetrySortColumn) {
    if (column === sortColumn) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortColumn(column)
    setSortDirection('asc')
  }

  async function loadMore() {
    if (!hasMore) return
    setLoadingMore(true)
    setError(null)
    const request = requestId.current
    const offset = records.length
    try {
      const page = await getTelemetry({
        satelliteId: satelliteId || undefined,
        // status: status || undefined,
        orderBy: sortColumn,
        orderDirection: sortDirection,
        limit: PAGE_SIZE,
        offset,
        filterBy: {},
      })
      if (requestId.current !== request) return
      setRecords((current) => [...current, ...page.records])
      setHasMore(page.hasMore)
    } catch (error) {
      if (requestId.current !== request) return
      setError(telemetryErrorMessage(error))
    } finally {
      if (requestId.current === request) setLoadingMore(false)
    }
  }

  async function onCreate(input: CreateTelemetryInput): Promise<string | null> {
    setError(null)
    try {
      await createTelemetry(input)
      // trigger reload of telemetry data.
      setRefreshToken((token) => token + 1)
      return null
    } catch (error) {
      const message = telemetryErrorMessage(error)
      setError(message)
      return message
    }
  }

  async function onDelete(id: string): Promise<TelemetryRecord | null> {
    // Tracking id's being deleted allows easy button disabling. 
    setDeletingIds((current) => new Set(current).add(id))
    setError(null)
    try {
      await deleteTelemetry(id)
      // We don't refetch after deleted, prevents excessive api calls on telemetry data.
      setRecords((current) => current.filter((record) => record.id !== id))
      return records.find((record) => record.id === id) || null
    } catch (error) {
      setError(telemetryErrorMessage(error))
      return null
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
    }
  }

  return {
    records,
    satelliteId,
    setSatelliteId,
    // status,
    // setStatus,
    sortColumn,
    sortDirection,
    setSort,
    loadMore,
    loading,
    loadingMore,
    hasMore,
    error,
    deletingIds,
    onDelete,
    onCreate,
  }
}
