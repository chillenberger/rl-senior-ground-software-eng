import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
const apiProxy = {
  target: 'http://localhost:3000',
  changeOrigin: true,
}

const telemetryProxy = {
  '/telemetry': apiProxy,
  '/satellites': apiProxy,
  '/health': apiProxy,
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: telemetryProxy,
  },
  preview: {
    proxy: telemetryProxy,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
