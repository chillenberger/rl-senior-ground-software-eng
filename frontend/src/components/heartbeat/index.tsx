/*
This heartbeat component provides continuous indication to the user the api is connected.

Implemented using polling makes it simple and reliable. 
*/
import { useEffect, useState } from 'react'
import { apiHealth } from '../../api'
import './styles.css'

const HEALTH_CHECK_INTERVAL_MS = 5_000

export default function Heartbeat() {
  const [healthy, setHealthy] = useState(true)
  const [ping, setPing] = useState(0)

  useEffect(() => {
    let active = true

    const checkHealth = () => {
      void apiHealth().then((next) => {
        if (!active) return
        setHealthy(next)
        if (next) setPing((count) => count + 1)
      })
    }

    checkHealth()
    const interval = setInterval(checkHealth, HEALTH_CHECK_INTERVAL_MS)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  const label = healthy ? 'API is healthy' : 'API is unreachable'
  return (
    <span
      className={healthy ? 'heartbeat heartbeat--connected' : 'heartbeat heartbeat--disconnected'}
      role="status"
      aria-label={label}
    >
      <span className="heartbeat__indicator" aria-hidden="true">
        {healthy ? <span key={ping} className="heartbeat__ping" /> : null}
        <span className="heartbeat__dot" />
      </span>
      {healthy ? 'connected' : 'disconnected'}
    </span>
  )
}
