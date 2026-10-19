/*
Application state is managed using the useState hook. This application is too simple to justify Redux or other state libraries and useState is built specifically for this purpose.
We utilize hoisting and prop drilling to manage state.
*/

import { useState, useEffect } from 'react'
import './App.css'
import { TelemetryTable } from './components/TelemetryTable/index'
import { SatelliteOverview } from './components/SatelliteOverview/index'
import { useSatellites } from './hooks/useSatellites'
import { useTelemetry } from './hooks/useTelemetry'
import Popup from './components/Popup/index'
import NewTelemetryForm from './components/NewTelemetryForm/index'
import Toast from './components/Toast/index'
import useNotifications from './hooks/useNotifications'
import Heartbeat from './components/heartbeat/index.tsx'

function App() {
  const [showNewTelemetryForm, setShowNewTelemetryForm] = useState(false)
  const { messages, onAddMessage, onDismissMessage } = useNotifications()
  const { satellites, error: satellitesError, reload: reloadSatellites} = useSatellites()
  const {
    records,
    satelliteId,
    setSatelliteId,
    parameters,
    measurementFilter,
    setMeasurementFilter,
    sortParameter,
    setSortParameter,
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
  } = useTelemetry()

  useEffect(() => {
    if (error) onAddMessage(error)
  }, [error, onAddMessage])
  
  useEffect(() => {
    if (satellitesError) onAddMessage(satellitesError)
  }, [satellitesError, onAddMessage])

  return (
    <main className="dashboard">
      <Heartbeat />
      <h1>Satellite telemetry</h1>
      <section aria-busy={loading || loadingMore}>
        <SatelliteOverview 
          satellites={satellites}
        />

        <TelemetryTable
          records={records}
          loading={loading}
          satellites={satellites}
          satelliteId={satelliteId}
          onSatelliteChange={setSatelliteId}
          parameters={parameters}
          measurementFilter={measurementFilter}
          onMeasurementFilterChange={setMeasurementFilter}
          sortParameter={sortParameter}
          onSortParameterChange={setSortParameter}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={setSort}
          onToggleSortDirection={toggleSortDirection}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMore()}
          deletingIds={deletingIds}
          onDelete={(id) => {
            void onDelete(id).then((deleted) => {
              if (deleted) void reloadSatellites()
            })
          }}
          onAddNewTelemetry={() => setShowNewTelemetryForm(true)}
        />
      </section>
      <Popup isOpen={showNewTelemetryForm} onClose={() => setShowNewTelemetryForm(false)}>
        <NewTelemetryForm
          satellites={satellites.map((satellite) => ({
            id: satellite.id,
          }))}
          onCreate={async (input) => {
            const message = await onCreate(input)
            if (message) return message
            setShowNewTelemetryForm(false)
            void reloadSatellites()
            return null
          }}
          onCancel={() => setShowNewTelemetryForm(false)}
        />
      </Popup>
      <Toast messages={messages} onDismiss={onDismissMessage} />
    </main>
  )
}

export default App
