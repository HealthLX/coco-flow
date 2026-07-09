import express from 'express'
import path, { dirname } from 'path'
import { fileURLToPath } from 'url'
import { createProxyMiddleware } from 'http-proxy-middleware'
import { fhirValidatorRouter, warmSession } from './fhirValidator.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
const FASTAPI_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000'
const DIST_DIR = path.join(__dirname, '..', 'dist')

// Served by Express, not FastAPI. Must be registered before the /api proxy,
// which would otherwise swallow it.
app.use('/api/fhir-validate', fhirValidatorRouter())

// Proxy all remaining /api/* requests to FastAPI, stripping the /api prefix
app.use(
  '/api',
  createProxyMiddleware({
    target: FASTAPI_URL,
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
    on: {
      error: (err, _req, res) => {
        console.error('[proxy] error:', err.message)
        if ('status' in res && typeof res.status === 'function') {
          res.status(502).json({ error: 'FastAPI proxy error', detail: err.message })
        }
      },
    },
  })
)

// Serve the built Vite app (production)
app.use(express.static(DIST_DIR))

// SPA fallback — all unmatched routes serve index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`CoCo Flow server running at http://localhost:${PORT}`)
  console.log(`  → Proxying /api/* to ${FASTAPI_URL}`)
  console.log(`  → Serving static files from ${DIST_DIR}`)

  // The first FHIR validation of a session loads the IG and takes ~50s. Pay that
  // cost here so a user's first click doesn't. Failure is non-fatal — the next
  // real request just re-establishes the session.
  warmSession().catch((err) => {
    console.warn('[fhir-validate] warmup failed (will retry on first request):', err.message)
  })
})
