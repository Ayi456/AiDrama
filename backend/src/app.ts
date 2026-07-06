import { serveStatic } from '@hono/node-server/serve-static'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import path from 'path'
import { fileURLToPath } from 'url'

import dramas from './routes/resources/dramas.js'
import chapters from './routes/resources/episodes.js'
import { chapterRoutePath } from './routes/policies/chapter-route-path.js'
import storyboards from './routes/resources/storyboards.js'
import scenes from './routes/resources/scenes.js'
import characters from './routes/resources/characters.js'
import images from './routes/resources/images.js'
import videos from './routes/resources/videos.js'
import upload from './routes/actions/upload.js'
import aiConfigs, { aiProviders } from './routes/configs/aiConfigs.js'
import agentConfigs from './routes/configs/agentConfigs.js'
import agent from './routes/actions/agent.js'
import compose from './routes/actions/compose.js'
import merge from './routes/actions/merge.js'
import grid from './routes/actions/grid.js'
import automation from './routes/actions/automation.js'
import payments from './routes/actions/payments.js'
import skills from './routes/configs/skills.js'
import assets from './routes/resources/assets.js'
import characterAssets from './routes/resources/characterAssets.js'
import preferences from './routes/resources/preferences.js'
import wallet from './routes/resources/wallet.js'
import webhooks from './routes/webhooks/webhooks.js'
import auth from './routes/auth/auth.js'
import { requireAuth } from './middleware/auth.js'
import { requestLogger, errorHandler } from './middleware/logger.js'
import { resumeRunningEpisodes } from './services/automation/episode-orchestrator.js'
import { externalAssetRedirectUrl } from './utils/external-asset-redirect.js'
import { notFound } from './utils/response.js'
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
  api.route('/auth', auth)
  api.route('/assets', assets)
  api.use('*', requireAuth)
  api.route('/dramas', dramas)
  api.route(chapterRoutePath, chapters)
  api.route('/storyboards', storyboards)
  api.route('/scenes', scenes)
  api.route('/characters', characters)
  api.route('/images', images)
  api.route('/videos', videos)
  api.route('/payments', payments)
  api.route('/wallet', wallet)
  api.route('/upload', upload)
  api.route('/ai-configs', aiConfigs)
  api.route('/ai-providers', aiProviders)
  api.route('/agent-configs', agentConfigs)
  api.route('/agent', agent)
  api.route('/compose', compose)
  api.route('/merge', merge)
  api.route('/grid', grid)
  api.route('/skills', skills)
  api.route('/character-assets', characterAssets)
  api.route('/preferences', preferences)
  api.route('/', automation)

  app.route('/api/v1', api)
  app.route('/webhooks', webhooks)

  // 未匹配的 API 路径必须返回 JSON 404，而不是落进 SPA 兜底返回 200 HTML。
  app.all('/api/*', (c) => notFound(c, 'api route not found'))

  // SCF 定时触发器对 Web 函数以 POST / 投递事件；SPA 兜底只接管 GET *，
  // 这里把根路径的 POST 当作自动化打点，推进所有 running 集（幂等）。
  app.post('/', async (c) => {
    const resumed = await resumeRunningEpisodes()
    return c.json({ code: 0, data: { resumed }, message: 'ok' })
  })

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
