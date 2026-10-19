import type { SatelliteSummary } from '../../api'
import './styles.css'

function countByStatus(satellites: SatelliteSummary[]): Array<string> {
  let satelliteIds = []
  for (const satellite of satellites) {
    if (satellite.oos === true) satelliteIds.push(satellite.id)
  }
  return satelliteIds
}

export function SatelliteOverview({ satellites }: { satellites: SatelliteSummary[] }) {
  const counts = countByStatus(satellites)

  return (
    <section className="satellite-overview" aria-labelledby="satellite-overview-heading">
      <h2 id="satellite-overview-heading">Satellite OOS</h2>
      <ul className="satellite-overview__list">
        {counts.map((satelliteId) => (
          <li className="satellite-overview__item" data-status="oos" key={satelliteId}>
            <span className="satellite-overview__value">{satelliteId}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
