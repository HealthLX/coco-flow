import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts: that one mounts the Express FHIR-validator plugin, which
// has no place in a unit-test run.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    // explodeFhirXml uses DOMParser/XMLSerializer.
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
