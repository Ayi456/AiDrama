import { serveStatic } from '@hono/node-server/serve-static'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import path from 'path'
import { fileURLToPath } from 'url'

import dramas from './routes/dramas.js'
import episodes from './routes/episodes.js'
import storyboards from './routes/storyboards.js'
import scenes from './routes/scenes.js'
import characters from './routes/characters.js'
import images from './routes/images.js'
import videos from './routes/videos.js'
import upload from './routes/upload.js'
import aiConfigs, { aiProviders } from './routes/aiConfigs.js'
import agentConfigs from './routes/agentConfigs.js'
import agent from './routes/agent.js'
import compose from './routes/compose.js'
import merge from './routes/merge.js'
import grid from './routes/grid.js'
import skills from './routes/skills.js'
import assets from './routes/assets.js'
import characterAssets from './routes/characterAssets.js'
import webhooks from './routes/webhooks.js'
import { requestLogger, errorHandler } from './middleware/logger.js'
import { externalAssetRedirectUrl } from './utils/external-asset-redirect.js'
import { resolveDataRoot, resolveFrontendPublicPath } from './utils/runtime-paths.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

function applyFrontendStaticHeaders(filePath: string, c: Context) {
  if (filePath.includes(`${path.sep}assets${path.sep}`)) {
    c.header('Cache-Control', 'public, immutable, max-age=31536000')
  }
}

async function frontendInlineDisposition(c: Context, next: () => Promise<void>) {
  c.header('Content-Disposition', 'inline')
  await next()
}

export function createApp() {
  const app = new Hono()

  app.use('*', cors({
    origin: ['http://localhost:3013', 'http://localhost:5679'],
    credentials: true,
  }))
  app.use('*', requestLogger)
  app.use('*', errorHandler)

  app.get('/api/v1/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

  const api = new Hono()
  api.route('/dramas', dramas)
  api.route('/episodes', episodes)
  api.route('/chapters', episodes)
  api.route('/storyboards', storyboards)
  api.route('/scenes', scenes)
  api.route('/characters', characters)
  api.route('/images', images)
  api.route('/videos', videos)
  api.route('/upload', upload)
  api.route('/ai-configs', aiConfigs)
  api.route('/ai-providers', aiProviders)
  api.route('/agent-configs', agentConfigs)
  api.route('/agent', agent)
  api.route('/compose', compose)
  api.route('/merge', merge)
  api.route('/grid', grid)
  api.route('/skills', skills)
  api.route('/assets', assets)
  api.route('/character-assets', characterAssets)

  app.route('/api/v1', api)
  app.route('/webhooks', webhooks)

  app.use('*', async (c, next) => {
    const target = externalAssetRedirectUrl(c.req.url)
    if (target) return c.redirect(target, 302)
    await next()
  })

  app.use('/static/*', serveStatic({ root: resolveDataRoot(projectRoot) }))

  const frontendPublicPath = resolveFrontendPublicPath(projectRoot)
  app.use('*', frontendInlineDisposition)
  app.use('*', serveStatic({ root: frontendPublicPath, onFound: applyFrontendStaticHeaders }))
  app.get('*', serveStatic({ root: frontendPublicPath, path: 'index.html', onFound: applyFrontendStaticHeaders }))

  return app
}

export const app = createApp()
