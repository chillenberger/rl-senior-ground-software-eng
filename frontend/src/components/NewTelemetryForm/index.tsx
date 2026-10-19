import { useState, useRef } from 'react'
import { type CreateTelemetryInput } from '../../api'
import './styles.css'

type SatelliteOptions = {
  id: string
}

type NewTelemetryFormProps = {
  satellites: SatelliteOptions[]
  onCreate: (input: CreateTelemetryInput) => Promise<string | null>
  onCancel: () => void
}

function fieldValue(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function measurementValue(value: string): number | string {
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(value)) return Number(value)
  return value
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
    const timestamp = fieldValue(formData, 'timestamp')
    const parsedTimestamp = new Date(timestamp ? `${timestamp}Z` : timestamp)
    const name = fieldValue(formData, 'name')
    const value = fieldValue(formData, 'value')

    if (!satelliteId) {
      setError('Choose a satellite')
      return
    }
    if (!timestamp || Number.isNaN(parsedTimestamp.getTime())) {
      setError('Timestamp must be a valid date and time')
      return
    }
    if (!name) {
      setError('Enter a measurement name')
      return
    }
    if (!value) {
      setError('Enter a value')
      return
    }
    setSubmitting(true)
    setError(null)
    const message = await onCreate({
      satelliteId,
      timestamp: parsedTimestamp.toISOString(),
      name,
      value: measurementValue(value),
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
      <label htmlFor="timestamp">Timestamp (UTC)</label>
      <input id="timestamp" name="timestamp" type="datetime-local" step="1" required />
      <label htmlFor="name">Measurement Name</label>
      <input id="name" name="name" type="text" required />
      <label htmlFor="value">Value</label>
      <input id="value" name="value" type="text" required />
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
