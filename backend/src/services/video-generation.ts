import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { getActiveConfig, getConfigById } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, readImageAsCompressedDataUrl } from '../utils/storage.js'
import { uploadStaticAssetToCos } from '../utils/cos.js'
import { getVideoAdapter } from './adapters/registry.js'
import type { AIConfig } from './adapters/types.js'
import { buildVideoCompletionPatch, publishGeneratedAsset } from './media-completion.js'
import { buildStoryboardVideoPatch } from './media-publication.js'
import {
  resolveImageReference,
  resolveStoredImageReferences,
  resolveStoredVideoOrAudioReferences,
  stringifyStringList,
} from './media-reference-resolver.js'
import { assembleVideoGenerateRequest } from './media-request-assembly.js'
import { runMediaPollingLoop } from './media-polling-loop.js'
import {
  buildJobFailurePatch,
  buildJobProcessingPatch,
  buildJobSnapshotPatch,
  normalizeJobErrorMessage,
} from './media-job-state.js'
import { isProviderApiError, sendProviderJsonRequest } from './media-provider-transport.js'
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
  processVideoGeneration(lastId, config).catch((error: unknown) => {
    const message = normalizeJobErrorMessage(error)
    logTaskError('VideoTask', 'process', { id: lastId, error: message })
    console.error(`Video generation ${lastId} failed:`, error)
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

    const referenceResolverDeps = {
      readImageAsCompressedDataUrl,
      uploadStaticAssetToCos,
      warn: (event: string, payload: { path: string; error: string }) => logTaskWarn('VideoTask', event, payload),
    }
    const resolvedImageUrl = await resolveImageReference(record.imageUrl, referenceResolverDeps)
    const resolvedFirstFrameUrl = await resolveImageReference(record.firstFrameUrl, referenceResolverDeps)
    const resolvedLastFrameUrl = await resolveImageReference(record.lastFrameUrl, referenceResolverDeps)
    const resolvedReferenceImageUrls = await resolveStoredImageReferences(record.referenceImageUrls, referenceResolverDeps)
    const resolvedReferenceVideoUrls = await resolveStoredVideoOrAudioReferences(record.referenceVideoUrls, referenceResolverDeps)
    const resolvedReferenceAudioUrls = await resolveStoredVideoOrAudioReferences(record.referenceAudioUrls, referenceResolverDeps)

    const { normalizedSpec, providerRequest } = assembleVideoGenerateRequest({
      adapter,
      config,
      record,
      resolvedReferences: {
        imageUrl: resolvedImageUrl,
        firstFrameUrl: resolvedFirstFrameUrl,
        lastFrameUrl: resolvedLastFrameUrl,
        referenceImageUrls: resolvedReferenceImageUrls,
        referenceVideoUrls: resolvedReferenceVideoUrls,
        referenceAudioUrls: resolvedReferenceAudioUrls,
      },
    })
    await db.update(schema.videoGenerations)
      .set(buildJobSnapshotPatch('normalizedRequest', normalizedSpec, now()))
      .where(eq(schema.videoGenerations.id, id))
      .run()

    const { url, method, headers, body } = providerRequest
    await db.update(schema.videoGenerations)
      .set(buildJobSnapshotPatch('providerRequest', body, now()))
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

    const result = await sendProviderJsonRequest({
      url,
      method,
      headers,
      body,
    })
    await db.update(schema.videoGenerations)
      .set(buildJobSnapshotPatch('providerResponse', result, now()))
      .where(eq(schema.videoGenerations.id, id))
      .run()

    const { isAsync, taskId, videoUrl } = adapter.parseGenerateResponse(result)

    if (!isAsync && videoUrl) {
      logTaskProgress('VideoTask', 'sync-complete', { id, videoUrl })
      await handleVideoComplete(id, videoUrl, record.duration, record.storyboardId)
      return
    }

    await db.update(schema.videoGenerations)
      .set(buildJobProcessingPatch(taskId, now()))
      .where(eq(schema.videoGenerations.id, id))
      .run()
    logTaskProgress('VideoTask', 'poll-start', { id, taskId, provider: config.provider })

    if (adapter.provider === 'vidu') {
      logTaskProgress('VideoTask', 'webhook-wait', { id, taskId, provider: adapter.provider })
      return
    }

    pollVideoTask(id, config, taskId!, record.storyboardId)
  } catch (error: unknown) {
    const message = normalizeJobErrorMessage(error)
    logTaskError('VideoTask', 'process', { id, provider: config.provider, error: message })
    await db.update(schema.videoGenerations)
      .set(buildJobFailurePatch(error, now()))
      .where(eq(schema.videoGenerations.id, id))
      .run()
  }
}

async function pollVideoTask(id: number, config: AIConfig, taskId: string, storyboardId?: number | null) {
  const adapter = getVideoAdapter(config.provider)

  const pollResult = await runMediaPollingLoop<void>({
    maxAttempts: 300,
    delayMs: 10000,
    onRetry: ({ attemptNumber, error }) => {
      logTaskWarn('VideoTask', 'poll-retry', { id, taskId, attempt: attemptNumber, error: error.message })
    },
    attempt: async ({ attemptNumber }) => {
      const { url, method, headers } = adapter.buildPollRequest(config, taskId)
      logTaskProgress('VideoTask', 'poll-request', {
        id,
        taskId,
        provider: config.provider,
        method,
        url: redactUrl(url),
        attempt: attemptNumber,
      })

      let result: unknown
      try {
        result = await sendProviderJsonRequest({
          url,
          method,
          headers,
        })
      } catch (error) {
        if (isProviderApiError(error)) return { type: 'continue' }
        throw error
      }

      await db.update(schema.videoGenerations)
        .set(buildJobSnapshotPatch('providerResponse', result, now()))
        .where(eq(schema.videoGenerations.id, id))
        .run()

      const pollResp = adapter.parsePollResponse(result)

      if (pollResp.status === 'completed' && pollResp.videoUrl) {
        logTaskSuccess('VideoTask', 'poll-complete', { id, taskId, videoUrl: pollResp.videoUrl })
        await handleVideoComplete(id, pollResp.videoUrl, null, storyboardId)
        return { type: 'done', value: undefined }
      }

      if (pollResp.status === 'failed') {
        logTaskError('VideoTask', 'poll-failed', { id, taskId, error: pollResp.error || 'Video generation failed' })
        throw new Error(pollResp.error || 'Video generation failed')
      }

      return { type: 'continue' }
    },
  })

  if (pollResult.status === 'done') return

  const errorMessage = pollResult.status === 'exhausted'
    ? 'Polling attempts exhausted'
    : pollResult.error.message
  logTaskError('VideoTask', 'poll-timeout', { id, taskId, error: errorMessage })
  await db.update(schema.videoGenerations)
    .set(buildJobFailurePatch(new Error(`Timeout: ${errorMessage}`), now()))
    .where(eq(schema.videoGenerations.id, id))
    .run()
}

async function handleVideoComplete(id: number, videoUrl: string, duration: number | null | undefined, storyboardId?: number | null) {
  const localPath = await downloadFile(videoUrl, 'videos')
  const publicUrl = await publishGeneratedAsset(localPath, uploadStaticAssetToCos)
  await db.update(schema.videoGenerations)
    .set(buildVideoCompletionPatch({ publicUrl, localPath, completedAt: now() }))
    .where(eq(schema.videoGenerations.id, id))
    .run()
  logTaskSuccess('VideoTask', 'downloaded', { id, localPath, publicUrl, storyboardId, duration })

  if (storyboardId) {
    await db.update(schema.storyboards)
      .set(buildStoryboardVideoPatch(publicUrl, duration, now()))
      .where(eq(schema.storyboards.id, storyboardId))
      .run()
  }
}
