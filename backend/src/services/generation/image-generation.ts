import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { getActiveConfig, getConfigById } from '../ai/ai.js'
import { now } from '../../utils/response.js'
import { downloadFile, readImageAsCompressedDataUrl, saveBase64Image } from '../../utils/storage.js'
import { uploadStaticAssetToCos } from '../../utils/cos.js'
import { getImageAdapter } from '../adapters/registry.js'
import type { AIConfig } from '../adapters/types.js'
import {
  completeGeneratedImageJob,
  type GeneratedImageSource,
} from '../media/assets/media-completion.js'
import {
  buildImageGenerationEnqueueRecord,
  buildImageGenerationEnqueueStartContext,
  buildMediaGenerationEnqueuePayload,
  type ImageGenerationEnqueueParams,
} from '../media/generation/media-generation-enqueue.js'
import { resolveImageReferenceArray } from '../media/assets/media-reference-resolver.js'
import { assembleImageGenerateRequest } from '../media/request/media-request-assembly.js'
import {
  buildImageGenerationRequestContext,
  loadMediaGenerationRecord,
} from '../media/generation/media-generation-records.js'
import { interpretImageGenerateResult, interpretImagePollResult } from '../media/request/media-result-interpretation.js'
import {
  prepareProviderGenerationAttempt,
  prepareProviderPollAttempt,
  submitProviderGenerationRequest,
  submitProviderPollAttempt,
} from '../media/provider/media-provider-execution.js'
import { runMediaPollingLoop } from '../media/job/media-polling-loop.js'
import {
  logDetachedMediaJobError,
  recordMediaJobFailure,
  recordMediaJobProcessingHandoff,
  recordMediaJobTimeout,
} from '../media/job/media-job-state.js'
import { createImageGenerationDbPersistence } from '../media/generation/media-generation-persistence.js'
import { isProviderApiError, sendProviderJsonRequest } from '../media/provider/media-provider-transport.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../../utils/task-logger.js'
import { onResourceCompleted } from '../automation/automation-hook.js'

async function notifyAutomationAfterImage(id: number, status: 'ok' | 'failed') {
  try {
    const [row] = await db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id))
    if (!row) return
    await onResourceCompleted({
      type: 'image',
      storyboardId: row.storyboardId ?? null,
      characterId: row.characterId ?? null,
      sceneId: row.sceneId ?? null,
      status,
    })
  } catch (err) {
    console.warn('[automation] image hook failed', err)
  }
}

type GenerateImageParams = ImageGenerationEnqueueParams

export async function generateImage(params: GenerateImageParams): Promise<number> {
  const ts = now()
  const config = params.configId
    ? await getConfigById(params.configId)
    : await getActiveConfig('image')
  if (!config) throw new Error('No active image AI config')

  const res = (await db.insert(schema.imageGenerations)
    .values(buildImageGenerationEnqueueRecord({ params, config, enqueuedAt: ts }))
    .run())

  const lastId = Number(res.lastInsertRowid)
  logTaskStart('ImageTask', 'enqueue', buildImageGenerationEnqueueStartContext({
    id: lastId,
    params,
    config,
  }))
  logTaskPayload('ImageTask', 'enqueue params', buildMediaGenerationEnqueuePayload({
    id: lastId,
    config,
    params,
  }))
  processImageGeneration(lastId, config).catch((error: unknown) => {
    logDetachedMediaJobError({
      taskName: 'ImageTask',
      event: 'process',
      id: lastId,
      error,
    }, {
      logError: logTaskError,
    })
    console.error(`Image generation ${lastId} failed:`, error)
  })
  return lastId
}

async function processImageGeneration(id: number, config: AIConfig) {
  const adapter = getImageAdapter(config.provider)
  const persistence = createImageGenerationDbPersistence(id)

  try {
    const loadedRecord = await loadMediaGenerationRecord(id, async (jobId) => {
      return await db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, jobId)).all()
    })
    if (loadedRecord.type === 'missing') return

    const record = loadedRecord.record
    logTaskProgress('ImageTask', 'build-request', buildImageGenerationRequestContext({
      id,
      provider: config.provider,
      record,
    }))

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

    const preparedGeneration = prepareProviderGenerationAttempt({
      id,
      config,
      providerRequest,
      extraLogContext: {
        model: record.model,
      },
      redactUrl,
    })
    logTaskProgress('ImageTask', 'request', preparedGeneration.requestLogContext)
    logTaskPayload('ImageTask', 'request payload', preparedGeneration.requestPayload)

    const result = await submitProviderGenerationRequest({
      normalizedSpec,
      providerRequest,
      timeoutMs: 600_000,
    }, {
      now,
      sendJsonRequest: sendProviderJsonRequest,
      persistSnapshot: persistence.persistSnapshot,
    })
    logTaskPayload('ImageTask', 'response payload', {
      id,
      provider: config.provider,
      result,
    })

    const generationResult = interpretImageGenerateResult(adapter, result)

    if (generationResult.type === 'completed-url') {
      logTaskProgress('ImageTask', 'sync-complete', { id, imageUrl: generationResult.imageUrl })
      await completeGeneratedImage(id, config.provider, { type: 'url', imageUrl: generationResult.imageUrl })
      await notifyAutomationAfterImage(id, 'ok')
      return
    }

    if (generationResult.type === 'completed-base64') {
      logTaskProgress('ImageTask', 'sync-base64-complete', { id, mimeType: generationResult.mimeType })
      await completeGeneratedImage(id, config.provider, {
        type: 'base64',
        data: generationResult.data,
        mimeType: generationResult.mimeType,
      })
      await notifyAutomationAfterImage(id, 'ok')
      return
    }

    if (generationResult.type === 'missing-output') {
      throw new Error(generationResult.message)
    }

    const taskId = generationResult.taskId
    await recordMediaJobProcessingHandoff({
      taskName: 'ImageTask',
      event: 'poll-start',
      id,
      taskId,
      provider: config.provider,
      updatedAt: now(),
    }, {
      logProgress: logTaskProgress,
      persistProcessing: persistence.persistProcessing,
    })
    pollImageTask(id, config, taskId)
  } catch (error: unknown) {
    await recordMediaJobFailure({
      taskName: 'ImageTask',
      event: 'process',
      id,
      provider: config.provider,
      error,
      failedAt: now(),
    }, {
      logError: logTaskError,
      persistFailure: persistence.persistFailure,
    })
    await notifyAutomationAfterImage(id, 'failed')
  }
}

async function pollImageTask(id: number, config: AIConfig, taskId: string) {
  const adapter = getImageAdapter(config.provider)
  const maxDurationMs = 600_000
  const persistence = createImageGenerationDbPersistence(id)

  const pollResult = await runMediaPollingLoop<void>({
    maxAttempts: 120,
    delayMs: 5000,
    maxDurationMs,
    timeoutMessage: 'Polling exceeded 10 minutes',
    onRetry: ({ attemptNumber, error }) => {
      logTaskWarn('ImageTask', 'poll-retry', { id, taskId, attempt: attemptNumber, error: error.message })
    },
    attempt: async ({ attemptNumber, remainingMs }) => {
      const preparedPoll = prepareProviderPollAttempt({
        id,
        taskId,
        attemptNumber,
        config,
        adapter,
        redactUrl,
      })
      logTaskProgress('ImageTask', 'poll-request', preparedPoll.logContext)

      const providerPoll = await submitProviderPollAttempt({
        providerRequest: preparedPoll.providerRequest,
        timeoutMs: Math.max(1_000, remainingMs ?? maxDurationMs),
      }, {
        now,
        isProviderApiError,
        sendJsonRequest: sendProviderJsonRequest,
        persistSnapshot: persistence.persistSnapshot,
      })
      if (providerPoll.type === 'continue') return { type: 'continue' }

      const result = providerPoll.result
      const pollDecision = interpretImagePollResult(adapter, result)

      if (pollDecision.type === 'completed-url') {
        logTaskSuccess('ImageTask', 'poll-complete', { id, taskId, imageUrl: pollDecision.imageUrl })
        await completeGeneratedImage(id, config.provider, { type: 'url', imageUrl: pollDecision.imageUrl })
        await notifyAutomationAfterImage(id, 'ok')
        return { type: 'done', value: undefined }
      }

      if (pollDecision.type === 'completed-base64') {
        logTaskSuccess('ImageTask', 'poll-base64-complete', { id, taskId, mimeType: pollDecision.mimeType })
        await completeGeneratedImage(id, config.provider, {
          type: 'base64',
          data: pollDecision.data,
          mimeType: pollDecision.mimeType,
        })
        await notifyAutomationAfterImage(id, 'ok')
        return { type: 'done', value: undefined }
      }

      if (pollDecision.type === 'failed') {
        logTaskError('ImageTask', 'poll-failed', { id, taskId, error: pollDecision.error })
        throw new Error(pollDecision.error)
      }

      return { type: 'continue' }
    },
  })

  if (pollResult.status === 'done') return

  const errorMessage = pollResult.status === 'exhausted'
    ? 'Polling attempts exhausted'
    : pollResult.error.message
  await recordMediaJobTimeout({
    taskName: 'ImageTask',
    event: 'poll-timeout',
    id,
    taskId,
    errorMessage,
    failedAt: now(),
  }, {
    logError: logTaskError,
    persistFailure: persistence.persistFailure,
  })
  await notifyAutomationAfterImage(id, 'failed')
}

async function completeGeneratedImage(id: number, provider: string, source: GeneratedImageSource) {
  const persistence = createImageGenerationDbPersistence(id)

  await completeGeneratedImageJob({
    id,
    provider,
    source,
  }, {
    now,
    downloadFile,
    saveBase64Image,
    uploadGeneratedAsset: uploadStaticAssetToCos,
    loadOwnerRecord: async (jobId) => {
      const loadedRecord = await loadMediaGenerationRecord(jobId, async (recordId) => {
        return await db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, recordId)).all()
      })
      return loadedRecord.type === 'found' ? loadedRecord.record : null
    },
    persistImageCompletion: persistence.persistImageCompletion,
    publishStoryboardImage: persistence.publishStoryboardImage,
    publishCharacterImage: persistence.publishCharacterImage,
    publishCharacterAssetImage: persistence.publishCharacterAssetImage,
    publishSceneImage: persistence.publishSceneImage,
    logSuccess: logTaskSuccess,
  })
}
