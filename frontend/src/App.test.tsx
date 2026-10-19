import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App.tsx'
import {
  getSatellites,
  getTelemetry,
  getTelemetryParameters,
  type SatelliteSummary,
  type TelemetryRecord,
} from './api.ts'

vi.mock('./api.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api.ts')>()
  return {
    ...actual,
    getTelemetry: vi.fn(),
    getSatellites: vi.fn(),
    getTelemetryParameters: vi.fn(),
    apiHealth: vi.fn(() => Promise.resolve(true)),
  }
})

const reading: TelemetryRecord = {
  id: 'reading-1',
  satelliteId: 'SAT-1',
  timestamp: '2026-10-07T18:00:00.000Z',
  measurement: {
    name: 'altitude',
    value: 500_000,
    units: 'm',
    oos: false,
  },
}

const satellite: SatelliteSummary = {
  id: 'SAT-1',
  operator: 'Rocket Lab',
  createdAt: '2026-10-07T18:00:00.000Z',
  updatedAt: null,
  oos: false,
}

beforeEach(() => {
  vi.mocked(getTelemetry).mockReset()
  vi.mocked(getSatellites).mockReset()
  vi.mocked(getTelemetryParameters).mockReset()
  vi.mocked(getSatellites).mockResolvedValue([])
  vi.mocked(getTelemetryParameters).mockResolvedValue([])
})

test('shows the telemetry table on the page', async () => {
  vi.mocked(getTelemetry).mockResolvedValue({ records: [reading], hasMore: false })

  render(<App />)

  expect(await screen.findByRole('table', { name: 'Telemetry readings' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: 'SAT-1' })).toBeInTheDocument()
})

test('lists a satellite`s parameters as measurement filter and value sort options', async () => {
  vi.mocked(getTelemetry).mockResolvedValue({ records: [reading], hasMore: false })
  vi.mocked(getSatellites).mockResolvedValue([satellite])
  vi.mocked(getTelemetryParameters).mockResolvedValue(['altitude', 'velocity'])

  render(<App />)

  const table = await screen.findByRole('table', { name: 'Telemetry readings' })
  expect(await within(table).findByRole('option', { name: 'SAT-1' })).toBeInTheDocument()
  fireEvent.change(within(table).getByLabelText('Satellite'), { target: { value: 'SAT-1' } })

  const measurement = within(table).getByLabelText('Measurement')
  const value = within(table).getByLabelText('Value')
  expect(await within(measurement).findByRole('option', { name: 'altitude' })).toBeInTheDocument()
  expect(within(measurement).getByRole('option', { name: 'velocity' })).toBeInTheDocument()
  expect(within(value).getByRole('option', { name: 'altitude' })).toBeInTheDocument()
  expect(within(value).getByRole('option', { name: 'velocity' })).toBeInTheDocument()
})

test('shows a toast when telemetry cannot be loaded', async () => {
  vi.mocked(getTelemetry).mockRejectedValue(new Error('Cannot reach the telemetry API'))

  render(<App />)

  expect(await screen.findByText('Cannot reach the telemetry API')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
})
