import express from 'express'
import path from 'path'
import { createProxyMiddleware } from 'http-proxy-middleware'

const app = express()
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
const FASTAPI_URL = process.env.FASTAPI_URL ?? 'http://localhost:8000'
const DIST_DIR = path.join(__dirname, '..', 'dist')

// Proxy all /api/* requests to FastAPI, stripping the /api prefix
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
})
