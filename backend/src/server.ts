import { serve } from '@hono/node-server'
import { app } from './app.js'

const port = Number(process.env.PORT || 5679)
const hostname = process.env.HOST || '0.0.0.0'

console.log(`AiDrama TS server on http://${hostname}:${port}`)
serve({ fetch: app.fetch, port, hostname })
