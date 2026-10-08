import { useState, useRef } from 'react'
import { HEALTH_STATUSES, type CreateTelemetryInput, type HealthStatus } from '../../api'
import './styles.css'

type SatelliteOptions = {
  id: string
}

type NewTelemetryFormProps = {
  satellites: SatelliteOptions[]
  onCreate: (input: CreateTelemetryInput) => Promise<string | null>
  onCancel: () => void
}

function isHealthStatus(value: string): value is HealthStatus {
  return HEALTH_STATUSES.some((status) => status === value)
}

function fieldValue(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function positiveNumber(value: string): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function NewTelemetryForm({ satellites, onCreate, onCancel }: NewTelemetryFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  function handleCancel() {
    setError(null)
    setSubmitting(false)
    formRef.current?.reset()
    onCancel()
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)
    const satelliteId = fieldValue(formData, 'satelliteId')
    const status = fieldValue(formData, 'status')
    const timestamp = fieldValue(formData, 'timestamp')
    const altitude = positiveNumber(fieldValue(formData, 'altitude'))
    const velocity = positiveNumber(fieldValue(formData, 'velocity'))
    const parsedTimestamp = new Date(timestamp ? `${timestamp}Z` : timestamp)

    if (!satelliteId) {
      setError('Choose a satellite')
      return
    }
    if (!isHealthStatus(status)) {
      setError('Choose a health status')
      return
    }
    if (!timestamp || Number.isNaN(parsedTimestamp.getTime())) {
      setError('Timestamp must be a valid date and time')
      return
    }
    if (altitude === null) {
      setError('Altitude must be a positive number')
      return
    }
    if (velocity === null) {
      setError('Velocity must be a positive number')
      return
    }

    setSubmitting(true)
    setError(null)
    const message = await onCreate({
      satelliteId,
      status,
      timestamp: parsedTimestamp.toISOString(),
      altitude,
      velocity,
    })
    setSubmitting(false)
    if (message) {
      setError(message)
      return
    }
    form.reset()
  }

  return (
    <form className="new-telemetry-form" ref={formRef} onSubmit={(event) => void handleSubmit(event)}>
      <h2>New telemetry</h2>
      {error ? <p className="new-telemetry-form__error" role="alert">{error}</p> : null}
      <label htmlFor="new-telemetry-satellite">Satellite</label>
      <select id="new-telemetry-satellite" name="satelliteId" disabled={satellites.length === 0}>
        {satellites.map((satellite) => (
          <option key={satellite.id} value={satellite.id}>{satellite.id}</option>
        ))}
      </select>
      <label htmlFor="new-telemetry-status">Status</label>
      <select id="new-telemetry-status" name="status" defaultValue="healthy">
        {HEALTH_STATUSES.map((status) => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
      <label htmlFor="timestamp">Timestamp (UTC)</label>
      <input id="timestamp" name="timestamp" type="datetime-local" step="1" required />
      <label htmlFor="altitude">Altitude (m)</label>
      <input id="altitude" name="altitude" type="number" min="0" step="any" required />
      <label htmlFor="velocity">Velocity (km/s)</label>
      <input id="velocity" name="velocity" type="number" min="0" step="any" required />
      <div className="new-telemetry-form__buttons">
        <button type="button" onClick={handleCancel}>Cancel</button>
        <button type="submit" disabled={submitting || satellites.length === 0}>
          {submitting ? 'Saving…' : 'Add telemetry'}
        </button>
      </div>
    </form>
  )
}

export default NewTelemetryForm
