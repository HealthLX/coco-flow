import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import express from 'express'
import type { Plugin } from 'vite'
import { fhirValidatorRouter, warmSession } from './server/fhirValidator'

/**
 * In production Express serves /api/fhir-validate and proxies everything else to
 * FastAPI. The dev server has no Express, and its /api proxy would send this route
 * to FastAPI (404). Mount the same router here so dev matches prod.
 *
 * The router is wrapped in an Express app because Vite's middleware stack is plain
 * connect — a bare Router would get a raw ServerResponse with no res.json/res.status.
 * Unmatched paths fall through to Vite's /api proxy below. Middlewares registered in
 * configureServer run before Vite's internal ones, so this takes precedence.
 */
function fhirValidatorPlugin(): Plugin {
  return {
    name: 'coco-fhir-validator',
    configureServer(server) {
      const app = express()
      app.use('/api/fhir-validate', fhirValidatorRouter())
      server.middlewares.use(app)
      warmSession().catch((err: Error) => {
        server.config.logger.warn(`[fhir-validate] warmup failed: ${err.message}`)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), fhirValidatorPlugin()],
  // tsconfig declares this path; without a matching alias an `@/` import type-checks
  // and then fails to resolve at runtime.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
