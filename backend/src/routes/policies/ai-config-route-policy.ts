import type { RouteBody } from '../shared/route-body.js'
import { hasOwn } from '../shared/route-body.js'

export const VALID_AI_SERVICE_TYPES = new Set(['text', 'image', 'video', 'vision'])

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
  & { config_id?: number }

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

export type AiConfigPublicSource = {
  id: number
  serviceType?: string | null
  provider?: string | null
  name?: string | null
  baseUrl?: string | null
  apiKey?: string | null
  model?: string | null
  settings?: string | null
  priority?: number | null
  isActive?: boolean | null
  createdAt?: string | null
  updatedAt?: string | null
}

export function validateAiConfigCreateBody(body: AiConfigCreateBody) {
  if (!body.service_type || !body.provider) return 'service_type and provider are required'
  if (!VALID_AI_SERVICE_TYPES.has(body.service_type)) return 'service_type must be one of text, image, video or vision'
  return null
}

export function validateAiConfigProbeBody(body: AiConfigProbeBody) {
  if (body.config_id != null) return null
  if (!body.service_type || !body.provider || !body.base_url) {
    return 'service_type, provider and base_url are required'
  }
  if (!VALID_AI_SERVICE_TYPES.has(body.service_type)) return 'service_type must be one of text, image, video or vision'
  return null
}

function parseAiConfigModel(raw: string | null | undefined) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseAiConfigSettings(raw: string | null | undefined) {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function buildAiConfigPublicPayload(row: AiConfigPublicSource) {
  return {
    id: row.id,
    service_type: row.serviceType || '',
    provider: row.provider || '',
    name: row.name || '',
    base_url: row.baseUrl || '',
    model: parseAiConfigModel(row.model),
    settings: parseAiConfigSettings(row.settings),
    priority: row.priority,
    is_active: row.isActive,
    has_api_key: Boolean(row.apiKey),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
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
