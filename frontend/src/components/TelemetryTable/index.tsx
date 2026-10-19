import type { 
  SatelliteSummary, 
  TelemetryRecord, 
  TelemetrySortColumn, 
  TelemetrySortDirection,
} from '../../api'
import { Spinner } from '../Spinner/index'
import './styles.css'

interface MeasurementRecord extends TelemetryRecord {
  name: string
}

type Column = {
  key: keyof MeasurementRecord
  label: string
  unit?: string
  sortable: boolean
  align: 'start' | 'end'
}

const COLUMNS: Column[] = [
  { key: 'satelliteId', label: 'Satellite', sortable: false, align: 'start' },
  { key: 'timestamp', label: 'Timestamp', unit: 'UTC', sortable: true, align: 'start' },
  { key: 'name', label: 'Measurement', sortable: false, align: 'start' },
  { key: 'measurement', label: 'Value', sortable: false, align: 'start' },
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


function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return timestampFormat.format(date)
}

function formatCell(record: TelemetryRecord, key: keyof MeasurementRecord): string {
  switch (key) {
    case 'timestamp':
      return formatTimestamp(record.timestamp)
    case 'measurement':
      return `${record.measurement.value} ${record.measurement.units ?? ''}`
    case 'name':
      return record.measurement.name
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
  parameters: string[]
  measurementFilter: string
  onMeasurementFilterChange: (name: string) => void
  sortParameter: string
  onSortParameterChange: (name: string) => void
  sortColumn: TelemetrySortColumn
  sortDirection: TelemetrySortDirection
  onSort: (column: TelemetrySortColumn) => void
  onToggleSortDirection: () => void
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
  parameters,
  measurementFilter,
  onMeasurementFilterChange,
  sortParameter,
  onSortParameterChange,
  sortColumn,
  sortDirection,
  onSort,
  onToggleSortDirection,
  hasMore,
  loadingMore,
  onLoadMore,
  deletingIds,
  onDelete,
  onAddNewTelemetry,
}: TelemetryTableProps) {

  const filtersApplied = satelliteId !== '' || measurementFilter !== ''

  return (
    <div className="telemetry-table">
      <div className="telemetry-table__header">
        <h2 id="telemetry-readings-heading">
          Telemetry readings
          {filtersApplied ? <span className="telemetry-table__warning">Limited view</span> : null}
        </h2>
        <button type="button" className="telemetry-table__add" onClick={onAddNewTelemetry}>
          New telemetry
        </button>
      </div>
      <div className="telemetry-table__scroll">
        <table className="telemetry-table__table" aria-labelledby="telemetry-readings-heading">
          <thead>
            <tr>
              {COLUMNS.map((column) => {
                const sortingThisColumn =
                  (column.key === 'timestamp' && sortColumn === 'timestamp')
                  || (column.key === 'measurement' && sortColumn === 'measurement.value')
                const announcesSort = column.key === 'timestamp' || column.key === 'measurement'
                const ariaSort = sortingThisColumn
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={announcesSort ? ariaSort : undefined}
                    className={column.align === 'end' ? 'telemetry-table__numeric' : undefined}
                  >
                    {column.key === 'satelliteId' ? (
                      <SatelliteFilter
                        satellites={satellites}
                        satelliteId={satelliteId}
                        onSatelliteChange={onSatelliteChange}
                      />
                    ) : column.key === 'name' ? (
                      <MeasurementFilter
                        parameters={parameters}
                        measurementFilter={measurementFilter}
                        disabled={satelliteId === ''}
                        onMeasurementFilterChange={onMeasurementFilterChange}
                      />
                    ) : column.key === 'measurement' ? (
                      <ValueSort
                        parameters={parameters}
                        sortParameter={sortParameter}
                        sortDirection={sortDirection}
                        disabled={satelliteId === ''}
                        onSortParameterChange={onSortParameterChange}
                        onToggleSortDirection={onToggleSortDirection}
                      />
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
                <tr key={record.id} data-status={record.measurement.oos ? 'oos' : undefined}>
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

function MeasurementFilter({
  parameters,
  measurementFilter,
  disabled,
  onMeasurementFilterChange,
}: {
  parameters: string[]
  measurementFilter: string
  disabled: boolean
  onMeasurementFilterChange: (name: string) => void
}) {
  return (
    <label className="telemetry-table__filter" htmlFor="measurement-filter">
      <span>Measurement</span>
      <select
        id="measurement-filter"
        value={measurementFilter}
        disabled={disabled}
        onChange={(event) => onMeasurementFilterChange(event.target.value)}
      >
        <option value="">All</option>
        {parameters.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}

function ValueSort({
  parameters,
  sortParameter,
  sortDirection,
  disabled,
  onSortParameterChange,
  onToggleSortDirection,
}: {
  parameters: string[]
  sortParameter: string
  sortDirection: TelemetrySortDirection
  disabled: boolean
  onSortParameterChange: (name: string) => void
  onToggleSortDirection: () => void
}) {
  const sortingByValue = sortParameter !== ''

  return (
    <div className="telemetry-table__filter">
      <label htmlFor="value-sort">Value</label>
      <select
        id="value-sort"
        value={sortParameter}
        disabled={disabled}
        onChange={(event) => onSortParameterChange(event.target.value)}
      >
        <option value="">—</option>
        {parameters.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="telemetry-table__sort"
        onClick={onToggleSortDirection}
        disabled={!sortingByValue}
        aria-label="Toggle value sort direction"
      >
        <span className="telemetry-table__indicator" aria-hidden="true">
          {sortingByValue ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
        </span>
      </button>
    </div>
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
