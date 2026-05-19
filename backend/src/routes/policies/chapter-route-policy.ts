import type { RouteBody } from './route-body.js'
import { hasOwn, readBodyNumber, readBodyString } from './route-body.js'

export type ChapterCreateBody = RouteBody & {
  drama_id?: number | string
  image_config_id?: number | string
  video_config_id?: number | string
  title?: string
}

export type ChapterUpdateBody = RouteBody & {
  content?: string | null
  script_content?: string | null
  title?: string | null
  description?: string | null
  status?: string | null
  image_config_id?: number | string | null
  video_config_id?: number | string | null
}

export type ChapterCreateValues = {
  dramaId: number
  episodeNumber: number
  title: string
  imageConfigId: number
  videoConfigId: number
  createdAt: string
  updatedAt: string
}

export type ChapterUpdatePatch = {
  updatedAt: string
  content?: string | null
  scriptContent?: string | null
  title?: string
  description?: string | null
  status?: string | null
  imageConfigId?: number | null
  videoConfigId?: number | null
}

function normalizeConfigId(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  return null
}

export function buildChapterCreateValues(
  body: ChapterCreateBody,
  episodeNumber: number,
  timestamp: string,
  imageConfigId: number,
  videoConfigId: number,
): ChapterCreateValues {
  return {
    dramaId: Number(body.drama_id || 0),
    episodeNumber,
    title: body.title || `Chapter ${episodeNumber}`,
    imageConfigId,
    videoConfigId,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function buildChapterUpdatePatch(body: ChapterUpdateBody, timestamp: string): ChapterUpdatePatch {
  const patch: ChapterUpdatePatch = { updatedAt: timestamp }
  if (hasOwn(body, 'content')) patch.content = body.content ?? null
  if (hasOwn(body, 'script_content')) patch.scriptContent = body.script_content ?? null
  if (hasOwn(body, 'title') && typeof body.title === 'string') patch.title = body.title
  if (hasOwn(body, 'description')) patch.description = body.description ?? null
  if (hasOwn(body, 'status')) patch.status = body.status ?? null
  if (hasOwn(body, 'image_config_id')) patch.imageConfigId = normalizeConfigId(body.image_config_id)
  if (hasOwn(body, 'video_config_id')) patch.videoConfigId = normalizeConfigId(body.video_config_id)
  return patch
}

export function readChapterDramaId(body: ChapterCreateBody) {
  return readBodyNumber(body, 'drama_id')
}

export function readChapterConfigId(body: ChapterCreateBody, key: 'image_config_id' | 'video_config_id') {
  return normalizeConfigId(body[key])
}

export function readChapterTitle(body: RouteBody, key: string) {
  return readBodyString(body, key)
}
