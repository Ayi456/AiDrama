type RouteBody = Record<string, unknown>

export const VALID_AI_SERVICE_TYPES = new Set(['text', 'image', 'video'])

export type AiConfigCreateBody = RouteBody & {
  service_type?: string
  provider?: string
  name?: string
  base_url?: string
  api_key?: string
  model?: unknown
  settings?: unknown
  priority?: number
}

export type AiConfigProbeBody = AiConfigCreateBody

export type AiConfigUpdateBody = RouteBody & {
  provider?: string
  name?: string
  base_url?: string
  api_key?: string
  model?: unknown
  settings?: unknown
  priority?: number | null
  is_active?: boolean | null
}

export type AiConfigCreateValues = {
  serviceType: string
  provider: string
  name: string
  baseUrl: string
  apiKey: string
  model: string
  settings: string | null
  priority: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type AiConfigUpdatePatch = {
  updatedAt: string
  provider?: string
  name?: string
  baseUrl?: string
  apiKey?: string
  model?: string
  settings?: string | null
  priority?: number | null
  isActive?: boolean | null
}

export type AiConfigProbePayloadInput = {
  ok: boolean
  status: number
  statusText: string
  method: string
  url: string
  responseText: string
}

function hasOwn(body: RouteBody, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key)
}

export function validateAiConfigCreateBody(body: AiConfigCreateBody) {
  if (!body.service_type || !body.provider) return 'service_type and provider are required'
  if (!VALID_AI_SERVICE_TYPES.has(body.service_type)) return 'service_type must be one of text, image or video'
  return null
}

export function validateAiConfigProbeBody(body: AiConfigProbeBody) {
  if (!body.service_type || !body.provider || !body.base_url) {
    return 'service_type, provider and base_url are required'
  }
  if (!VALID_AI_SERVICE_TYPES.has(body.service_type)) return 'service_type must be one of text, image or video'
  return null
}

export function buildAiConfigCreateValues(body: AiConfigCreateBody, timestamp: string): AiConfigCreateValues {
  const serviceType = body.service_type || ''
  const provider = body.provider || ''

  return {
    serviceType,
    provider,
    name: body.name || `${provider}-${serviceType}`,
    baseUrl: body.base_url || '',
    apiKey: body.api_key || '',
    model: JSON.stringify(body.model || []),
    settings: body.settings == null ? null : JSON.stringify(body.settings),
    priority: body.priority || 0,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function buildAiConfigUpdatePatch(body: AiConfigUpdateBody, updatedAt: string): AiConfigUpdatePatch {
  const updates: AiConfigUpdatePatch = { updatedAt }
  if (hasOwn(body, 'provider')) updates.provider = body.provider
  if (hasOwn(body, 'name')) updates.name = body.name
  if (hasOwn(body, 'base_url')) updates.baseUrl = body.base_url
  if (hasOwn(body, 'api_key')) updates.apiKey = body.api_key
  if (hasOwn(body, 'model')) updates.model = JSON.stringify(body.model)
  if (hasOwn(body, 'settings')) updates.settings = body.settings == null ? null : JSON.stringify(body.settings)
  if (hasOwn(body, 'priority')) updates.priority = body.priority
  if (hasOwn(body, 'is_active')) updates.isActive = body.is_active
  return updates
}

export function buildAiConfigProbePayload(input: AiConfigProbePayloadInput) {
  const reachable = [200, 204, 400, 401, 403].includes(input.status)

  return {
    ok: input.ok,
    reachable,
    status: input.status,
    status_text: input.statusText,
    method: input.method,
    url: input.url,
    message: reachable
      ? (input.ok
        ? 'Endpoint reachable; authentication and path look valid'
        : 'Endpoint responded; check status code for authentication or path issues')
      : 'Endpoint did not return an expected probe status; check Base URL and proxy settings',
    response_preview: input.responseText.slice(0, 240),
  }
}

export function errorMessageFromUnknown(error: unknown) {
  if (error instanceof Error) return error.message || 'Request failed'
  if (typeof error === 'string') return error || 'Request failed'
  return 'Request failed'
}
