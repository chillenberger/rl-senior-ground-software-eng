import { HEALTH_STATUSES, type HealthStatus, type SatelliteSummary, type TelemetryRecord, type TelemetrySortColumn, type TelemetrySortDirection } from '../../api'
import { Spinner } from '../Spinner/index'
import './styles.css'

type Column = {
  key: keyof TelemetryRecord
  label: string
  unit?: string
  sortable: boolean
  align: 'start' | 'end'
}

const COLUMNS: Column[] = [
  { key: 'satelliteId', label: 'Satellite', sortable: false, align: 'start' },
  { key: 'timestamp', label: 'Timestamp', unit: 'UTC', sortable: true, align: 'start' },
  { key: 'altitude', label: 'Altitude', unit: 'm', sortable: true, align: 'end' },
  { key: 'velocity', label: 'Velocity', unit: 'km/s', sortable: true, align: 'end' },
  { key: 'status', label: 'Status', sortable: false, align: 'start' },
]

const timestampFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const altitudeFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const velocityFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return timestampFormat.format(date)
}

function formatStatus(status: HealthStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function formatCell(record: TelemetryRecord, key: keyof TelemetryRecord): string {
  switch (key) {
    case 'timestamp':
      return formatTimestamp(record.timestamp)
    case 'altitude':
      return altitudeFormat.format(record.altitude)
    case 'velocity':
      return velocityFormat.format(record.velocity)
    case 'status':
      return formatStatus(record.status)
    default:
      return record[key]
  }
}

type TelemetryTableProps = {
  records: TelemetryRecord[]
  loading: boolean
  satellites: SatelliteSummary[]
  satelliteId: string
  onSatelliteChange: (satelliteId: string) => void
  status: HealthStatus | ''
  onStatusChange: (status: HealthStatus | '') => void
  sortColumn: TelemetrySortColumn
  sortDirection: TelemetrySortDirection
  onSort: (column: TelemetrySortColumn) => void
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  deletingIds: ReadonlySet<string>
  onDelete: (id: string) => void
  onAddNewTelemetry: () => void
}

export function TelemetryTable({
  records,
  loading,
  satellites,
  satelliteId,
  onSatelliteChange,
  status,
  onStatusChange,
  sortColumn,
  sortDirection,
  onSort,
  hasMore,
  loadingMore,
  onLoadMore,
  deletingIds,
  onDelete,
  onAddNewTelemetry,
}: TelemetryTableProps) {

  return (
    <div className="telemetry-table">
      <div className="telemetry-table__header">
        <h2 id="telemetry-readings-heading">Telemetry readings</h2>
        <button type="button" className="telemetry-table__add" onClick={onAddNewTelemetry}>
          New telemetry
        </button>
      </div>
      <div className="telemetry-table__scroll">
        <table className="telemetry-table__table" aria-labelledby="telemetry-readings-heading">
          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const sortedByColumn = column.sortable && sortColumn === column.key
                const ariaSort = sortedByColumn
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={column.sortable ? ariaSort : undefined}
                    className={column.align === 'end' ? 'telemetry-table__numeric' : undefined}
                  >
                    {column.key === 'satelliteId' ? (
                      <SatelliteFilter
                        satellites={satellites}
                        satelliteId={satelliteId}
                        onSatelliteChange={onSatelliteChange}
                      />
                    ) : column.key === 'status' ? (
                      <StatusFilter status={status} onStatusChange={onStatusChange} />
                    ) : column.sortable ? (
                      <SortColumnButton
                        column={column}
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={onSort}
                      />
                    ) : (
                      <span className="telemetry-table__heading">
                        <span>{column.label}</span>
                        {column.unit ? <span className="telemetry-table__unit">{column.unit}</span> : null}
                      </span>
                    )}
                  </th>
                )
              })}
              <th scope="col" className="telemetry-table__actions">
                <span className="telemetry-table__heading">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="telemetry-table__empty" colSpan={COLUMNS.length + 1}>
                  <Spinner label="Loading readings" />
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td className="telemetry-table__empty" colSpan={COLUMNS.length + 1}>
                  No readings to show.
                </td>
              </tr>
            ) : (
              records.map((record) => (
                <tr key={record.id} data-status={record.status === 'healthy' ? undefined : record.status}>
                  {COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      className={column.align === 'end' ? 'telemetry-table__numeric' : undefined}
                    >
                      {formatCell(record, column.key)}
                    </td>
                  ))}
                  <td className="telemetry-table__actions">
                    <button
                      type="button"
                      className="telemetry-table__delete"
                      onClick={() => onDelete(record.id)}
                      disabled={deletingIds.has(record.id)}
                    >
                      {deletingIds.has(record.id) ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="telemetry-table__pager">
        <p>{loading ? 'Loading readings…' : `${records.length} readings`}</p>
        {hasMore ? (
          <button type="button" onClick={onLoadMore} disabled={loadingMore || loading}>
            {loadingMore ? <Spinner label="Loading more" /> : 'Load more'}
          </button>
        ) : null}
      </div>
    </div>
  )
}


function SortColumnButton({ column, sortColumn, sortDirection, onSort }: { column: Column, sortColumn: TelemetrySortColumn, sortDirection: TelemetrySortDirection, onSort: (column: TelemetrySortColumn) => void }) {
  const sortedByColumn = column.sortable && sortColumn === column.key

  return (
    <button
      type="button"
      className="telemetry-table__sort"
      onClick={() => onSort(column.key as TelemetrySortColumn)}
    >
      <span>{column.label}</span>
      {column.unit ? <span className="telemetry-table__unit">{column.unit}</span> : null}
      <span className="telemetry-table__indicator" aria-hidden="true">
        {sortedByColumn ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
      </span>
    </button>
  )
}

function SatelliteFilter({
  satellites,
  satelliteId,
  onSatelliteChange,
}: {
  satellites: SatelliteSummary[]
  satelliteId: string
  onSatelliteChange: (satelliteId: string) => void
}) {
  return (
    <label className="telemetry-table__filter" htmlFor="satellite-filter">
      <span>Satellite</span>
      <select
        id="satellite-filter"
        value={satelliteId}
        onChange={(event) => onSatelliteChange(event.target.value)}
      >
        <option value="">All</option>
        {satellites.map((satellite) => (
          <option key={satellite.id} value={satellite.id}>
            {satellite.id}
          </option>
        ))}
      </select>
    </label>
  )
}

function isStatusFilter(value: string): value is HealthStatus | '' {
  return value === '' || HEALTH_STATUSES.some((status) => status === value)
}

function StatusFilter({
  status,
  onStatusChange,
}: {
  status: HealthStatus | ''
  onStatusChange: (status: HealthStatus | '') => void
}) {
  return (
    <label className="telemetry-table__filter" htmlFor="status-filter">
      <span>Status</span>
      <select
        id="status-filter"
        value={status}
        onChange={(event) => {
          const value = event.target.value
          if (isStatusFilter(value)) onStatusChange(value)
        }}
      >
        <option value="">All</option>
        {HEALTH_STATUSES.map((value) => (
          <option key={value} value={value}>
            {formatStatus(value)}
          </option>
        ))}
      </select>
    </label>
  )
}