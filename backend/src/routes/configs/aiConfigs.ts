import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, notFound, created, badRequest, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { joinProviderUrl } from '../services/adapters/url.js'
import { redactUrl, logTaskError, logTaskProgress, logTaskSuccess } from '../utils/task-logger.js'
import {
  buildAiConfigCreateValues,
  buildAiConfigProbePayload,
  buildAiConfigPublicPayload,
  buildAiConfigUpdatePatch,
  errorMessageFromUnknown,
  validateAiConfigCreateBody,
  validateAiConfigProbeBody,
  VALID_AI_SERVICE_TYPES,
  type AiConfigCreateBody,
  type AiConfigProbeBody,
  type AiConfigUpdateBody,
} from './ai-config-route-policy.js'

const app = new Hono()

type ProbeRequest = {
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
}

function firstStoredModel(raw: string | null | undefined) {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && typeof parsed[0] === 'string' ? parsed[0] : undefined
  } catch {
    return undefined
  }
}

function bearerHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function geminiHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
    headers['x-goog-api-key'] = apiKey
  }
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function viduHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Token ${apiKey}`
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function buildProbe(
  serviceType: string,
  provider: string,
  baseUrl: string,
  model?: string,
  apiKey?: string,
): ProbeRequest {
  const p = provider.toLowerCase()
  const m = model || ''

  if (p === 'gemini') {
    const url = new URL(joinProviderUrl(baseUrl, '/v1beta', `/models/${m || 'gemini-2.5-flash'}:generateContent`))
    if (apiKey) url.searchParams.set('key', apiKey)
    return { method: 'POST', url: url.toString(), headers: geminiHeaders(apiKey, true), body: {} }
  }

  if (p === 'openai' || p === 'openrouter' || p === 'chatfire') {
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '/v1', '/models'),
      headers: bearerHeaders(apiKey),
      body: undefined,
    }
  }

  if (p === 'ali') {
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v1', serviceType === 'video'
        ? '/services/aigc/video-generation/video-synthesis'
        : '/services/aigc/image-generation/generation'),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'volcengine') {
    const path = serviceType === 'video'
      ? '/contents/generations/tasks'
      : '/images/generations'
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v3', path),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'minimax') {
    const path = serviceType === 'video'
      ? '/video_generation'
      : '/image_generation'
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/v1', path),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'vidu') {
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '', '/ent/v2/img2video'),
      headers: viduHeaders(apiKey, true),
      body: {},
    }
  }

  return {
    method: 'GET',
    url: joinProviderUrl(baseUrl, '', m ? `/${m}` : '/'),
    headers: bearerHeaders(apiKey),
    body: undefined,
  }
}

// GET /ai-configs?service_type=text
app.get('/', async (c) => {
  const serviceType = c.req.query('service_type')
  if (serviceType && !VALID_AI_SERVICE_TYPES.has(serviceType)) {
    return success(c, [])
  }

  let rows = (await db.select().from(schema.aiServiceConfigs).all())
    .filter((row) => VALID_AI_SERVICE_TYPES.has(row.serviceType))
  if (serviceType) rows = rows.filter((row) => row.serviceType === serviceType)

  const parsed = rows.map(buildAiConfigPublicPayload)
  return success(c, parsed)
})

// POST /ai-configs
app.post('/', async (c) => {
  const body = await c.req.json() as AiConfigCreateBody
  const validationError = validateAiConfigCreateBody(body)
  if (validationError) return badRequest(c, validationError)

  const res = (await db.insert(schema.aiServiceConfigs)
    .values(buildAiConfigCreateValues(body, now()))
    .run())

  const [row] = (await db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.id, Number(res.lastInsertRowid))).all())

  return created(c, buildAiConfigPublicPayload(row))
})

// POST /ai-configs/test
app.post('/test', async (c) => {
  const body = await c.req.json() as AiConfigProbeBody
  const validationError = validateAiConfigProbeBody(body)
  if (validationError) return badRequest(c, validationError)

  let serviceType = body.service_type || ''
  let provider = body.provider || ''
  let baseUrl = body.base_url || ''
  let apiKey = body.api_key
  let model = Array.isArray(body.model) ? body.model[0] : body.model

  if (body.config_id != null) {
    const id = Number(body.config_id)
    const [row] = (await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id)).all())
    if (!row || !VALID_AI_SERVICE_TYPES.has(row.serviceType)) return notFound(c)
    serviceType = body.service_type || row.serviceType
    provider = body.provider || row.provider || ''
    baseUrl = body.base_url || row.baseUrl
    apiKey = body.api_key || row.apiKey
    model = model || firstStoredModel(row.model)
  }

  const probe = buildProbe(
    serviceType,
    provider,
    baseUrl,
    typeof model === 'string' ? model : undefined,
    apiKey,
  )
  const probeUrl = redactUrl(probe.url)

  logTaskProgress('AIConfig', 'probe-start', {
    serviceType,
    provider,
    method: probe.method,
    url: probeUrl,
  })

  try {
    const resp = await fetch(probe.url, {
      method: probe.method,
      headers: probe.headers,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
    })
    const text = await resp.text()
    const payload = buildAiConfigProbePayload({
      ok: resp.ok,
      status: resp.status,
      statusText: resp.statusText,
      method: probe.method,
      url: probeUrl,
      responseText: text,
    })

    if (payload.reachable) {
      logTaskSuccess('AIConfig', 'probe-done', {
        provider,
        status: resp.status,
        url: probeUrl,
      })
    } else {
      logTaskError('AIConfig', 'probe-unexpected', {
        provider,
        status: resp.status,
        url: probeUrl,
      })
    }
    return success(c, payload)
  } catch (error: unknown) {
    const message = errorMessageFromUnknown(error)
    logTaskError('AIConfig', 'probe-failed', {
      provider,
      url: probeUrl,
      error: message,
    })
    return success(c, {
      ok: false,
      reachable: false,
      method: probe.method,
      url: probeUrl,
      message,
      response_preview: '',
    })
  }
})

// GET /ai-configs/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = (await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id)).all())
  if (!row || !VALID_AI_SERVICE_TYPES.has(row.serviceType)) return notFound(c)
  return success(c, {
    ...buildAiConfigPublicPayload(row),
  })
})

// PUT /ai-configs/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json() as AiConfigUpdateBody
  const updates = buildAiConfigUpdatePatch(body, now())

  await db.update(schema.aiServiceConfigs).set(updates).where(eq(schema.aiServiceConfigs.id, id)).run()
  return success(c)
})

// DELETE /ai-configs/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.delete(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id)).run()
  return success(c)
})

// GET /ai-providers
export const aiProviders = new Hono()
aiProviders.get('/', async (c) => {
  const rows = (await db.select().from(schema.aiServiceProviders).all())
  const parsed = rows.map(r => ({
    ...toSnakeCase(r),
    preset_models: r.presetModels ? JSON.parse(r.presetModels) : [],
  }))
  return success(c, parsed)
})

export default app
