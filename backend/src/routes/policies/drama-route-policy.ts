import type { RouteBody } from './route-body.js'
import { hasOwn, readBodyNumber, readBodyString, readBodyStringArray } from './route-body.js'

export type DramaCreateBody = RouteBody & {
  title?: string
  description?: string | null
  genre?: string | null
  style?: string | null
  tags?: unknown
  metadata?: unknown
  image_config_id?: number | string | null
  video_config_id?: number | string | null
  total_episodes?: number | string | null
}

export type DramaUpdateBody = RouteBody & {
  title?: string
  description?: string | null
  genre?: string | null
  style?: string | null
  status?: string | null
  tags?: unknown
  metadata?: unknown
  image_config_id?: number | string | null
  video_config_id?: number | string | null
}

export type DramaCreateValues = {
  title: string
  description?: string | null
  genre?: string | null
  style?: string | null
  tags: string | null
  metadata: string | null
  imageConfigId: number | null
  videoConfigId: number | null
  status: 'draft'
  createdAt: string
  updatedAt: string
}

export type DramaUpdatePatch = {
  updatedAt: string
  title?: string
  description?: string | null
  genre?: string | null
  style?: string | null
  status?: string
  tags?: string | null
  metadata?: string | null
  imageConfigId?: number | null
  videoConfigId?: number | null
}

export type DramaEpisodeValues = {
  dramaId: number
  episodeNumber: number
  title: string
  imageConfigId: number | null
  videoConfigId: number | null
  status: 'draft'
  createdAt: string
  updatedAt: string
}

function stringifyJson(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return null
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function normalizeConfigId(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  return null
}

export function buildDramaCreateValues(
  body: DramaCreateBody,
  timestamp: string,
  imageConfigId: number | null,
  videoConfigId: number | null,
): DramaCreateValues {
  return {
    title: body.title || '',
    description: body.description || null,
    genre: body.genre || null,
    style: body.style || null,
    tags: stringifyJson(body.tags) ?? null,
    metadata: stringifyJson(body.metadata) ?? null,
    imageConfigId,
    videoConfigId,
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function buildDramaUpdatePatch(body: DramaUpdateBody, timestamp: string): DramaUpdatePatch {
  const patch: DramaUpdatePatch = { updatedAt: timestamp }
  if (hasOwn(body, 'title')) patch.title = body.title || ''
  if (hasOwn(body, 'description')) patch.description = body.description || null
  if (hasOwn(body, 'genre')) patch.genre = body.genre || null
  if (hasOwn(body, 'style')) patch.style = body.style || null
  if (hasOwn(body, 'status') && typeof body.status === 'string') patch.status = body.status
  if (hasOwn(body, 'tags')) patch.tags = stringifyJson(body.tags) ?? null
  if (hasOwn(body, 'metadata')) patch.metadata = stringifyJson(body.metadata) ?? null
  if (hasOwn(body, 'image_config_id')) patch.imageConfigId = normalizeConfigId(body.image_config_id)
  if (hasOwn(body, 'video_config_id')) patch.videoConfigId = normalizeConfigId(body.video_config_id)
  return patch
}

export function buildDramaEpisodeValues(
  dramaId: number,
  episodeNumber: number,
  title: string | undefined,
  timestamp: string,
  imageConfigId: number | null,
  videoConfigId: number | null,
): DramaEpisodeValues {
  return {
    dramaId,
    episodeNumber,
    title: title || `Chapter ${episodeNumber}`,
    imageConfigId,
    videoConfigId,
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function readDramaConfigIds(body: DramaCreateBody) {
  return {
    imageConfigId: normalizeConfigId(body.image_config_id),
    videoConfigId: normalizeConfigId(body.video_config_id),
  }
}

export function readDramaBodyString(body: RouteBody, key: string) {
  return readBodyString(body, key)
}

export function readDramaBodyNumber(body: RouteBody, key: string) {
  return readBodyNumber(body, key)
}

export function readDramaBodyStringArray(body: RouteBody, key: string) {
  return readBodyStringArray(body, key)
}
