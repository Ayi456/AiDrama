import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { getActiveConfig, getConfigById } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, readImageAsCompressedDataUrl } from '../utils/storage.js'
import { uploadStaticAssetToCos } from '../utils/cos.js'
import { getVideoAdapter } from './adapters/registry.js'
import type { AIConfig } from './adapters/types.js'
import { buildVideoJobSpecFromLegacyRequest } from './provider-spec.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'

interface GenerateVideoParams {
  storyboardId?: number
  dramaId?: number
  prompt: string
  model?: string
  referenceMode?: string
  imageUrl?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
  referenceImageUrls?: string[] | string
  referenceVideoUrls?: string[] | string
  referenceAudioUrls?: string[] | string
  duration?: number
  aspectRatio?: string
  configId?: number
}

function normalizeStringList(value: string[] | string | null | undefined): string[] {
  if (!value) return []
  if (Array.isArray(value)) return Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean)))
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return Array.from(new Set(parsed.map(item => String(item || '').trim()).filter(Boolean)))
  } catch {}
  return Array.from(new Set(String(value).split(/\r?\n|,/).map(item => item.trim()).filter(Boolean)))
}

function stringifyStringList(value: string[] | string | null | undefined) {
  const items = normalizeStringList(value)
  return items.length ? JSON.stringify(items) : null
}

function toJson(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

export async function generateVideo(params: GenerateVideoParams): Promise<number> {
  const ts = now()
  const config = params.configId
    ? await getConfigById(params.configId)
    : await getActiveConfig('video')
  if (!config) throw new Error('No active video AI config')

  const res = (await db.insert(schema.videoGenerations).values({
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    prompt: params.prompt,
    model: params.model || config.model,
    provider: config.provider,
    referenceMode: params.referenceMode || 'none',
    imageUrl: params.imageUrl,
    firstFrameUrl: params.firstFrameUrl,
    lastFrameUrl: params.lastFrameUrl,
    referenceImageUrls: stringifyStringList(params.referenceImageUrls),
    referenceVideoUrls: stringifyStringList(params.referenceVideoUrls),
    referenceAudioUrls: stringifyStringList(params.referenceAudioUrls),
    duration: params.duration || 5,
    aspectRatio: params.aspectRatio || '16:9',
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  }).run())

  const lastId = Number(res.lastInsertRowid)
  logTaskStart('VideoTask', 'enqueue', {
    id: lastId,
    provider: config.provider,
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    referenceMode: params.referenceMode || 'none',
    duration: params.duration || 5,
  })
  logTaskPayload('VideoTask', 'enqueue params', {
    id: lastId,
    config: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
    },
    params,
  })
  processVideoGeneration(lastId, config).catch(err => {
    logTaskError('VideoTask', 'process', { id: lastId, error: err.message })
    console.error(`Video generation ${lastId} failed:`, err)
  })
  return lastId
}

async function processVideoGeneration(id: number, config: AIConfig) {
  const adapter = getVideoAdapter(config.provider)

  try {
    const rows = (await db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all())
    const record = rows[0]
    if (!record) return
    logTaskProgress('VideoTask', 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      referenceMode: record.referenceMode,
    })

    const resolvedImageUrl = await normalizeVideoReferenceUrl(record.imageUrl)
    const resolvedFirstFrameUrl = await normalizeVideoReferenceUrl(record.firstFrameUrl)
    const resolvedLastFrameUrl = await normalizeVideoReferenceUrl(record.lastFrameUrl)
    const resolvedReferenceImageUrls = await normalizeVideoReferenceUrls(record.referenceImageUrls)
    const resolvedReferenceVideoUrls = await normalizeVideoReferenceUrls(record.referenceVideoUrls, normalizeVideoOrAudioReferenceUrl)
    const resolvedReferenceAudioUrls = await normalizeVideoReferenceUrls(record.referenceAudioUrls, normalizeVideoOrAudioReferenceUrl)

    const normalizedSpec = buildVideoJobSpecFromLegacyRequest({
      prompt: record.prompt,
      referenceMode: record.referenceMode,
      imageUrl: resolvedImageUrl,
      firstFrameUrl: resolvedFirstFrameUrl,
      lastFrameUrl: resolvedLastFrameUrl,
      referenceImageUrls: resolvedReferenceImageUrls,
      referenceVideoUrls: resolvedReferenceVideoUrls,
      referenceAudioUrls: resolvedReferenceAudioUrls,
      duration: record.duration,
      aspectRatio: record.aspectRatio,
    }, config.settings as any)
    await db.update(schema.videoGenerations)
      .set({ normalizedRequest: toJson(normalizedSpec), updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()

    const { url, method, headers, body } = adapter.buildGenerateRequest(config, {
      id: record.id,
      model: record.model,
      prompt: record.prompt,
      referenceMode: record.referenceMode,
      imageUrl: resolvedImageUrl,
      firstFrameUrl: resolvedFirstFrameUrl,
      lastFrameUrl: resolvedLastFrameUrl,
      referenceImageUrls: resolvedReferenceImageUrls ? JSON.stringify(resolvedReferenceImageUrls) : null,
      referenceVideoUrls: resolvedReferenceVideoUrls ? JSON.stringify(resolvedReferenceVideoUrls) : null,
      referenceAudioUrls: resolvedReferenceAudioUrls ? JSON.stringify(resolvedReferenceAudioUrls) : null,
      duration: record.duration,
      aspectRatio: record.aspectRatio,
      normalizedSpec,
    })
    await db.update(schema.videoGenerations)
      .set({ providerRequest: toJson(body), updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
    logTaskProgress('VideoTask', 'request', {
      id,
      provider: config.provider,
      method,
      url: redactUrl(url),
      model: record.model,
      referenceMode: record.referenceMode,
    })
    logTaskPayload('VideoTask', 'request payload', {
      id,
      method,
      url,
      headers,
      body,
    })

    const resp = await fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
    })

    if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`)
    const result = await resp.json() as any
    await db.update(schema.videoGenerations)
      .set({ providerResponse: toJson(result), updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()

    const { isAsync, taskId, videoUrl } = adapter.parseGenerateResponse(result)

    if (!isAsync && videoUrl) {
      logTaskProgress('VideoTask', 'sync-complete', { id, videoUrl })
      // 同步模式
      await handleVideoComplete(id, videoUrl, record.duration, record.storyboardId)
      return
    }

    // 异步模式：更新 taskId，开始轮询
    await db.update(schema.videoGenerations)
      .set({ taskId, status: 'processing', updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
    logTaskProgress('VideoTask', 'poll-start', { id, taskId, provider: config.provider })

    // Vidu 没有轮询端点，跳过轮询（依赖 Webhook 回调）
    if (adapter.provider === 'vidu') {
      logTaskProgress('VideoTask', 'webhook-wait', { id, taskId, provider: adapter.provider })
      return
    }

    pollVideoTask(id, config, taskId!, record.storyboardId)
  } catch (err: any) {
    logTaskError('VideoTask', 'process', { id, provider: config.provider, error: err.message })
    await db.update(schema.videoGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
  }
}

async function normalizeVideoReferenceUrl(value: string | null | undefined): Promise<string | null> {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('data:image/')) return raw
  if (raw.startsWith('static/') || raw.startsWith('/static/')) {
    const localPath = raw.startsWith('/static/') ? raw.slice(1) : raw
    try {
      return await readImageAsCompressedDataUrl(localPath, {
        maxWidth: 768,
        maxHeight: 768,
        quality: 68,
      })
    } catch (err) {
      logTaskWarn('VideoTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
      return null
    }
  }
  return raw
}

async function normalizeVideoOrAudioReferenceUrl(value: string | null | undefined): Promise<string | null> {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('data:')) return raw
  if (raw.startsWith('static/') || raw.startsWith('/static/')) {
    const localPath = raw.startsWith('/static/') ? raw.slice(1) : raw
    try {
      return await uploadStaticAssetToCos(localPath) || localPath
    } catch (err) {
      logTaskWarn('VideoTask', 'reference-media-upload-failed', { path: localPath, error: (err as Error).message })
      return null
    }
  }
  return raw
}

async function normalizeVideoReferenceUrls(
  raw: string | null | undefined,
  normalizeOne: (value: string | null | undefined) => Promise<string | null> = normalizeVideoReferenceUrl,
): Promise<string[]> {
  if (!raw) return []
  let refs: string[] = []
  try {
    const parsed = JSON.parse(raw)
    refs = Array.isArray(parsed) ? parsed : typeof parsed === 'string' ? [parsed] : []
  } catch {
    refs = normalizeStringList(raw)
  }
  const normalized = await Promise.all(
    Array.from(new Set(refs.map((item) => String(item || '').trim()).filter(Boolean))).map((item) => normalizeOne(item)),
  )
  return normalized.filter((item): item is string => !!item)
}

async function pollVideoTask(id: number, config: AIConfig, taskId: string, storyboardId?: number | null) {
  const adapter = getVideoAdapter(config.provider)

  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 10000))
    try {
      const { url, method, headers } = adapter.buildPollRequest(config, taskId)
      logTaskProgress('VideoTask', 'poll-request', {
        id,
        taskId,
        provider: config.provider,
        method,
        url: redactUrl(url),
        attempt: i + 1,
      })
      const resp = await fetch(url, { method, headers })
      if (!resp.ok) continue
      const result = await resp.json() as any
      await db.update(schema.videoGenerations)
        .set({ providerResponse: toJson(result), updatedAt: now() })
        .where(eq(schema.videoGenerations.id, id))
        .run()

      const pollResp = adapter.parsePollResponse(result)

      if (pollResp.status === 'completed' && pollResp.videoUrl) {
        logTaskSuccess('VideoTask', 'poll-complete', { id, taskId, videoUrl: pollResp.videoUrl })
        await handleVideoComplete(id, pollResp.videoUrl, null, storyboardId)
        return
      }
      if (pollResp.status === 'failed') {
        logTaskError('VideoTask', 'poll-failed', { id, taskId, error: pollResp.error || 'Video generation failed' })
        throw new Error(pollResp.error || 'Video generation failed')
      }
    } catch (err: any) {
      if (i === 299) {
        logTaskError('VideoTask', 'poll-timeout', { id, taskId, error: err.message })
        await db.update(schema.videoGenerations)
          .set({ status: 'failed', errorMsg: `Timeout: ${err.message}`, updatedAt: now() })
          .where(eq(schema.videoGenerations.id, id))
          .run()
        return
      }
      logTaskWarn('VideoTask', 'poll-retry', { id, taskId, attempt: i + 1, error: err.message })
    }
  }
}

async function handleVideoComplete(id: number, videoUrl: string, duration: number | null | undefined, storyboardId?: number | null) {
  const localPath = await downloadFile(videoUrl, 'videos')
  const publicUrl = await uploadStaticAssetToCos(localPath) || localPath
  await db.update(schema.videoGenerations)
    .set({ videoUrl: publicUrl, localPath, minioUrl: publicUrl, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(eq(schema.videoGenerations.id, id))
    .run()
  logTaskSuccess('VideoTask', 'downloaded', { id, localPath, publicUrl, storyboardId, duration })

  if (storyboardId) {
    await db.update(schema.storyboards)
      .set({ videoUrl: publicUrl, duration: duration || undefined, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
  }
}
