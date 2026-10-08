import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App.tsx'
import { getSatellites, getTelemetry, type TelemetryRecord } from './api.ts'

vi.mock('./api.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api.ts')>()
  return {
    ...actual,
    getTelemetry: vi.fn(),
    getSatellites: vi.fn(),
    apiHealth: vi.fn(() => Promise.resolve(true)),
  }
})

const reading: TelemetryRecord = {
  id: 'reading-1',
  satelliteId: 'SAT-1',
  timestamp: '2026-10-07T18:00:00.000Z',
  altitude: 500_000,
  velocity: 7.66,
  status: 'healthy',
}

beforeEach(() => {
  vi.mocked(getTelemetry).mockReset()
  vi.mocked(getSatellites).mockReset()
  vi.mocked(getSatellites).mockResolvedValue([])
})

test('shows the telemetry table on the page', async () => {
  vi.mocked(getTelemetry).mockResolvedValue({ records: [reading], hasMore: false })

  render(<App />)

  expect(await screen.findByRole('table', { name: 'Telemetry readings' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: 'SAT-1' })).toBeInTheDocument()
})

test('shows a toast when telemetry cannot be loaded', async () => {
  vi.mocked(getTelemetry).mockRejectedValue(new Error('Cannot reach the telemetry API'))

  render(<App />)

  expect(await screen.findByText('Cannot reach the telemetry API')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
})
