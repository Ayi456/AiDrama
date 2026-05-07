import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { getActiveConfig, getConfigById } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, readImageAsCompressedDataUrl, saveBase64Image } from '../utils/storage.js'
import { uploadStaticAssetToCos } from '../utils/cos.js'
import { getImageAdapter } from './adapters/registry.js'
import type { AIConfig } from './adapters/types.js'
import { resolveRequestedImageSize } from './image-size.js'
import { buildImageCompletionPatch, publishGeneratedAsset } from './media-completion.js'
import { buildCharacterImagePatch, buildSceneImagePatch, buildStoryboardImagePatch } from './media-publication.js'
import { resolveImageReferenceArray } from './media-reference-resolver.js'
import { assembleImageGenerateRequest } from './media-request-assembly.js'
import { runMediaPollingLoop } from './media-polling-loop.js'
import {
  buildJobFailurePatch,
  buildJobProcessingPatch,
  buildJobSnapshotPatch,
  normalizeJobErrorMessage,
} from './media-job-state.js'
import { isProviderApiError, sendProviderJsonRequest } from './media-provider-transport.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'

interface GenerateImageParams {
  storyboardId?: number
  dramaId?: number
  sceneId?: number
  characterId?: number
  prompt: string
  model?: string
  size?: string
  referenceImages?: string[]
  frameType?: string
  configId?: number
}

export async function generateImage(params: GenerateImageParams): Promise<number> {
  const ts = now()
  const config = params.configId
    ? await getConfigById(params.configId)
    : await getActiveConfig('image')
  if (!config) throw new Error('No active image AI config')

  const res = (await db.insert(schema.imageGenerations).values({
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    prompt: params.prompt,
    model: params.model || config.model,
    provider: config.provider,
    size: resolveRequestedImageSize(config.provider, params.size, params.model || config.model),
    frameType: params.frameType,
    referenceImages: params.referenceImages ? JSON.stringify(params.referenceImages) : null,
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  }).run())

  const lastId = Number(res.lastInsertRowid)
  logTaskStart('ImageTask', 'enqueue', {
    id: lastId,
    provider: config.provider,
    storyboardId: params.storyboardId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    frameType: params.frameType,
    model: params.model || config.model,
  })
  logTaskPayload('ImageTask', 'enqueue params', {
    id: lastId,
    config: {
      provider: config.provider,
      model: config.model,
      baseUrl: config.baseUrl,
    },
    params,
  })
  processImageGeneration(lastId, config).catch((error: unknown) => {
    const message = normalizeJobErrorMessage(error)
    logTaskError('ImageTask', 'process', { id: lastId, error: message })
    console.error(`Image generation ${lastId} failed:`, error)
  })
  return lastId
}

async function processImageGeneration(id: number, config: AIConfig) {
  const adapter = getImageAdapter(config.provider)

  try {
    const rows = (await db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all())
    const record = rows[0]
    if (!record) return
    logTaskProgress('ImageTask', 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      sceneId: record.sceneId,
      characterId: record.characterId,
      frameType: record.frameType,
    })

    const resolvedReferenceImages = await resolveImageReferenceArray(record.referenceImages, {
      readImageAsCompressedDataUrl,
      warn: (event, payload) => logTaskWarn('ImageTask', event, payload),
    })
    const { normalizedSpec, providerRequest } = assembleImageGenerateRequest({
      adapter,
      config,
      record,
      resolvedReferenceImages,
    })
    await db.update(schema.imageGenerations)
      .set(buildJobSnapshotPatch('normalizedRequest', normalizedSpec, now()))
      .where(eq(schema.imageGenerations.id, id))
      .run()

    const { url, method, headers, body } = providerRequest
    await db.update(schema.imageGenerations)
      .set(buildJobSnapshotPatch('providerRequest', body, now()))
      .where(eq(schema.imageGenerations.id, id))
      .run()
    logTaskProgress('ImageTask', 'request', {
      id,
      provider: config.provider,
      method,
      url: redactUrl(url),
      model: record.model,
    })
    logTaskPayload('ImageTask', 'request payload', {
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
      timeoutMs: 600_000,
    })
    await db.update(schema.imageGenerations)
      .set(buildJobSnapshotPatch('providerResponse', result, now()))
      .where(eq(schema.imageGenerations.id, id))
      .run()
    logTaskPayload('ImageTask', 'response payload', {
      id,
      provider: config.provider,
      result,
    })

    const { isAsync, taskId, imageUrl } = adapter.parseGenerateResponse(result)

    if (!isAsync && imageUrl) {
      logTaskProgress('ImageTask', 'sync-complete', { id, imageUrl })
      await handleImageComplete(id, config.provider, imageUrl)
      return
    }

    if (!isAsync && !imageUrl) {
      const b64 = adapter.extractImageBase64(result)
      if (b64) {
        logTaskProgress('ImageTask', 'sync-base64-complete', { id, mimeType: b64.mimeType })
        await handleImageCompleteBase64(id, config.provider, b64.data, b64.mimeType)
        return
      }
      throw new Error('No image URL or base64 data in response')
    }

    await db.update(schema.imageGenerations)
      .set(buildJobProcessingPatch(taskId, now()))
      .where(eq(schema.imageGenerations.id, id))
      .run()
    logTaskProgress('ImageTask', 'poll-start', { id, taskId, provider: config.provider })
    pollImageTask(id, config, taskId!)
  } catch (error: unknown) {
    const message = normalizeJobErrorMessage(error)
    logTaskError('ImageTask', 'process', { id, provider: config.provider, error: message })
    await db.update(schema.imageGenerations)
      .set(buildJobFailurePatch(error, now()))
      .where(eq(schema.imageGenerations.id, id))
      .run()
  }
}

async function pollImageTask(id: number, config: AIConfig, taskId: string) {
  const adapter = getImageAdapter(config.provider)
  const maxDurationMs = 600_000

  const pollResult = await runMediaPollingLoop<void>({
    maxAttempts: 120,
    delayMs: 5000,
    maxDurationMs,
    timeoutMessage: 'Polling exceeded 10 minutes',
    onRetry: ({ attemptNumber, error }) => {
      logTaskWarn('ImageTask', 'poll-retry', { id, taskId, attempt: attemptNumber, error: error.message })
    },
    attempt: async ({ attemptNumber, remainingMs }) => {
      const { url, method, headers } = adapter.buildPollRequest(config, taskId)
      logTaskProgress('ImageTask', 'poll-request', {
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
          timeoutMs: Math.max(1_000, remainingMs ?? maxDurationMs),
        })
      } catch (error) {
        if (isProviderApiError(error)) return { type: 'continue' }
        throw error
      }

      await db.update(schema.imageGenerations)
        .set(buildJobSnapshotPatch('providerResponse', result, now()))
        .where(eq(schema.imageGenerations.id, id))
        .run()

      const pollResp = adapter.parsePollResponse(result)

      if (pollResp.status === 'completed' && pollResp.imageUrl) {
        logTaskSuccess('ImageTask', 'poll-complete', { id, taskId, imageUrl: pollResp.imageUrl })
        await handleImageComplete(id, config.provider, pollResp.imageUrl)
        return { type: 'done', value: undefined }
      }

      if (pollResp.status === 'completed' && adapter.provider === 'gemini') {
        const b64 = adapter.extractImageBase64(result)
        if (b64) {
          logTaskSuccess('ImageTask', 'poll-base64-complete', { id, taskId, mimeType: b64.mimeType })
          await handleImageCompleteBase64(id, config.provider, b64.data, b64.mimeType)
          return { type: 'done', value: undefined }
        }
      }

      if (pollResp.status === 'failed') {
        logTaskError('ImageTask', 'poll-failed', { id, taskId, error: pollResp.error || 'Generation failed' })
        throw new Error(pollResp.error || 'Generation failed')
      }

      return { type: 'continue' }
    },
  })

  if (pollResult.status === 'done') return

  const errorMessage = pollResult.status === 'exhausted'
    ? 'Polling attempts exhausted'
    : pollResult.error.message
  logTaskError('ImageTask', 'poll-timeout', { id, taskId, error: errorMessage })
  await db.update(schema.imageGenerations)
    .set(buildJobFailurePatch(new Error(`Timeout: ${errorMessage}`), now()))
    .where(eq(schema.imageGenerations.id, id))
    .run()
}

async function handleImageComplete(id: number, provider: string, imageUrl: string) {
  const localPath = await downloadFile(imageUrl, 'images')
  const publicUrl = await publishGeneratedAsset(localPath, uploadStaticAssetToCos)
  const rows = (await db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all())
  const record = rows[0]

  await db.update(schema.imageGenerations)
    .set(buildImageCompletionPatch({ publicUrl, localPath, updatedAt: now() }))
    .where(eq(schema.imageGenerations.id, id))
    .run()
  logTaskSuccess('ImageTask', 'downloaded', { id, provider, localPath, publicUrl })

  // Publish the generated image onto the storyboard, character, or scene that owns it.
  if (record?.storyboardId) {
    await db.update(schema.storyboards)
      .set(buildStoryboardImagePatch(record.frameType, publicUrl, now()))
      .where(eq(schema.storyboards.id, record.storyboardId))
      .run()
  }
  if (record?.characterId) {
    await db.update(schema.characters)
      .set(buildCharacterImagePatch(publicUrl, localPath, now()))
      .where(eq(schema.characters.id, record.characterId))
      .run()
  }
  if (record?.sceneId) {
    await db.update(schema.scenes)
      .set(buildSceneImagePatch(publicUrl, localPath, now()))
      .where(eq(schema.scenes.id, record.sceneId))
      .run()
  }
}

async function handleImageCompleteBase64(id: number, provider: string, base64Data: string, mimeType: string) {
  const localPath = await saveBase64Image(base64Data, mimeType, 'images')
  const publicUrl = await publishGeneratedAsset(localPath, uploadStaticAssetToCos)
  const rows = (await db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all())
  const record = rows[0]

  await db.update(schema.imageGenerations)
    .set(buildImageCompletionPatch({ publicUrl, localPath, updatedAt: now() }))
    .where(eq(schema.imageGenerations.id, id))
    .run()
  logTaskSuccess('ImageTask', 'saved-base64', { id, provider, mimeType, localPath, publicUrl })

  // Publish the generated image onto the storyboard, character, or scene that owns it.
  if (record?.storyboardId) {
    await db.update(schema.storyboards)
      .set(buildStoryboardImagePatch(record.frameType, publicUrl, now()))
      .where(eq(schema.storyboards.id, record.storyboardId))
      .run()
  }
  if (record?.characterId) {
    await db.update(schema.characters)
      .set(buildCharacterImagePatch(publicUrl, localPath, now()))
      .where(eq(schema.characters.id, record.characterId))
      .run()
  }
  if (record?.sceneId) {
    await db.update(schema.scenes)
      .set(buildSceneImagePatch(publicUrl, localPath, now()))
      .where(eq(schema.scenes.id, record.sceneId))
      .run()
  }
}
