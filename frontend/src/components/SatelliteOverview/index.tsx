import type { HealthStatus, SatelliteSummary } from '../../api'
import './styles.css'

const STATUSES: { status: HealthStatus; label: string }[] = [
  { status: 'healthy', label: 'Healthy' },
  { status: 'anomaly', label: 'Anomaly' },
  { status: 'critical', label: 'Critical' },
]

function countByStatus(satellites: SatelliteSummary[]): Record<HealthStatus, number> {
  const counts: Record<HealthStatus, number> = { healthy: 0, anomaly: 0, critical: 0 }
  for (const satellite of satellites) {
    const status = satellite.latestReading?.status
    if (status) counts[status] += 1
  }
  return counts
}

export function SatelliteOverview({ satellites }: { satellites: SatelliteSummary[] }) {
  const counts = countByStatus(satellites)

  return (
    <section className="satellite-overview" aria-labelledby="satellite-overview-heading">
      <h2 id="satellite-overview-heading">Satellite Statuses</h2>
      <ul className="satellite-overview__list">
        {STATUSES.map(({ status, label }) => (
          <li key={status} className="satellite-overview__item" data-status={status}>
            <span className="satellite-overview__value">{counts[status]}</span>
            <span className="satellite-overview__label">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
