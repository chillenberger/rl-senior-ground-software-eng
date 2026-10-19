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
  getTelemetryParameters,
  type CreateTelemetryInput,
  type TelemetryRecord,
  type TelemetrySortColumn,
  type TelemetrySortDirection,
} from '../api'

export type { TelemetryRecord, TelemetrySortColumn, TelemetrySortDirection }

const PAGE_SIZE = 10

export function useTelemetry() {
  const [records, setRecords] = useState<TelemetryRecord[]>([])
  const [satelliteId, setSatelliteIdState] = useState('')
  // const [status, setStatus] = useState<HealthStatus | ''>('')
  const [sortColumn, setSortColumn] = useState<TelemetrySortColumn>('timestamp')
  const [sortDirection, setSortDirection] = useState<TelemetrySortDirection>('desc')
  const [parameters, setParameters] = useState<string[]>([])
  const [measurementFilter, setMeasurementFilterState] = useState('')
  const [sortParameter, setSortParameterState] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const requestId = useRef(0)
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(new Set())
  const measurementFilterRef = useRef(measurementFilter)
  const sortParameterRef = useRef(sortParameter)

  function measurementFilters() {
    if (!measurementFilter) return []
    return [{ name: 'measurement.name', value: measurementFilter }]
  }

  function clearValueSort() {
    setSortParameterState('')
    setSortColumn('timestamp')
    setSortDirection('desc')
  }

  function setSatelliteId(next: string) {
    setSatelliteIdState(next)
    if (next !== '') return
    setParameters([])
    setMeasurementFilterState('')
    if (sortParameter) clearValueSort()
  }

  useEffect(() => {
    measurementFilterRef.current = measurementFilter
    sortParameterRef.current = sortParameter
  }, [measurementFilter, sortParameter])

  /*
  Parameter names belong to one satellite.
  Reload when the satellite changes, and drop a filter or value sort the new list does not include.
  */
  useEffect(() => {
    if (!satelliteId) return

    const controller = new AbortController()

    const load = async () => {
      try {
        const names = await getTelemetryParameters(satelliteId, controller.signal)
        if (controller.signal.aborted) return
        setParameters(names)
        if (measurementFilterRef.current && !names.includes(measurementFilterRef.current)) {
          setMeasurementFilterState('')
        }
        if (sortParameterRef.current && !names.includes(sortParameterRef.current)) {
          setSortParameterState('')
          setSortColumn('timestamp')
          setSortDirection('desc')
        }
      } catch (error) {
        if (axios.isAxiosError(error) && error.code === 'ERR_CANCELED') return
        if (controller.signal.aborted) return
        setParameters([])
        setMeasurementFilterState('')
        if (sortParameterRef.current) {
          setSortParameterState('')
          setSortColumn('timestamp')
          setSortDirection('desc')
        }
        setError(telemetryErrorMessage(error))
      }
    }

    void load()
    return () => controller.abort()
  }, [satelliteId])

  /* 
  Load initial telemetry records.

  Reload on changes to satellite id, measurement filter, sort column, or sort direction.
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
          orderBy: sortColumn,
          orderDirection: sortDirection,
          limit: PAGE_SIZE,
          offset: 0,
          filterBy: measurementFilter
            ? [{ name: 'measurement.name', value: measurementFilter }]
            : [],
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
  }, [satelliteId, measurementFilter, sortColumn, sortDirection, refreshToken])

  function setMeasurementFilter(name: string) {
    setMeasurementFilterState(name)
    if (sortParameter && sortParameter !== name) clearValueSort()
  }

  function setSortParameter(name: string) {
    if (!name) {
      clearValueSort()
      return
    }
    setSortParameterState(name)
    setMeasurementFilterState(name)
    setSortColumn('measurement.value')
    setSortDirection('asc')
  }

  function setSort(column: TelemetrySortColumn) {
    if (column !== 'timestamp') return
    if (sortColumn === 'timestamp') {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortParameterState('')
    setSortColumn('timestamp')
    setSortDirection('asc')
  }

  function toggleSortDirection() {
    setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
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
        filterBy: measurementFilters(),
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
    parameters,
    measurementFilter,
    setMeasurementFilter,
    sortParameter,
    setSortParameter,
    // status,
    // setStatus,
    sortColumn,
    sortDirection,
    setSort,
    toggleSortDirection,
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
