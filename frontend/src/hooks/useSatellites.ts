/*
This hook centralizes all Satellite data management in one place.
This makes it simple to understand and easily extendable in the future.
*/
import { useEffect, useState } from 'react'
import axios from 'axios'
import { getSatellites, telemetryErrorMessage, type SatelliteSummary } from '../api'

export type { SatelliteSummary }

/*
Easily check if error is due to abort signal. 
*/
function isCanceled(error: unknown): boolean {
  return axios.isAxiosError(error) && error.code === 'ERR_CANCELED'
}

export function useSatellites() {
  const [satellites, setSatellites] = useState<SatelliteSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Use AbortController to ensure we cleanup api call on unmount. 
    const controller = new AbortController()

    getSatellites(controller.signal)
      .then((next) => {
        setSatellites(next)
        setError(null)
      })
      .catch((error: unknown) => {
        if (isCanceled(error)) return
        setError(telemetryErrorMessage(error))
      })
      .finally(() => {
        setLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [])

  function reload() {
    return getSatellites()
      .then((next) => {
        setSatellites(next)
        setError(null)
      })
      .catch((error: unknown) => {
        if (isCanceled(error)) return
        setError(telemetryErrorMessage(error))
      })
  }

  return { satellites, loading, error, reload }
}
