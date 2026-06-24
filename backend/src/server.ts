import { serve } from '@hono/node-server'
import { app } from './app.js'

const port = Number(process.env.PORT || 5679)
const hostname = process.env.HOST || '0.0.0.0'

console.log(`AiDrama TS server on http://${hostname}:${port}`)
serve({ fetch: app.fetch, port, hostname })

// Resume in-progress automation sessions only when the real server starts.
void import('./services/automation/episode-orchestrator.js')
  .then(m => m.bootResume())
  .catch(err => console.warn('[automation] bootResume import failed:', err))
