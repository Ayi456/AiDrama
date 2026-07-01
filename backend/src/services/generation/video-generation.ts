import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { getActiveConfig, getConfigById } from '../ai/ai.js'
import { now } from '../../utils/response.js'
import { downloadFile, readImageAsCompressedDataUrl } from '../../utils/storage.js'
import { uploadStaticAssetToCos } from '../../utils/cos.js'
import { getVideoDurationPrecise } from '../ffmpeg/ffmpeg.js'
import { getVideoAdapter } from '../adapters/registry.js'
import type { AIConfig, ProviderUsage } from '../adapters/types.js'
import {
  completeGeneratedVideoJob,
  type GeneratedVideoSource,
} from '../media/assets/media-completion.js'
import {
  resolveVideoGenerationReferences,
} from '../media/assets/media-reference-resolver.js'
import {
  buildMediaGenerationEnqueuePayload,
  buildVideoGenerationEnqueueRecord,
  buildVideoGenerationEnqueueStartContext,
  type VideoGenerationEnqueueParams,
} from '../media/generation/media-generation-enqueue.js'
import { assembleVideoGenerateRequest } from '../media/request/media-request-assembly.js'
import {
  buildVideoGenerationPollingContext,
  buildVideoGenerationRequestContext,
  loadMediaGenerationRecord,
} from '../media/generation/media-generation-records.js'
import { interpretVideoGenerateResult, interpretVideoPollResult } from '../media/request/media-result-interpretation.js'
import {
  prepareProviderGenerationAttempt,
  prepareProviderPollAttempt,
  submitProviderGenerationRequest,
  submitProviderPollAttempt,
} from '../media/provider/media-provider-execution.js'
import { runMediaPollingLoop } from '../media/job/media-polling-loop.js'
import {
  buildJobProviderTaskUnconfirmedPatch,
  logDetachedMediaJobError,
  recordMediaJobFailure,
  recordMediaJobProcessingHandoff,
} from '../media/job/media-job-state.js'
import { createVideoGenerationDbPersistence } from '../media/generation/media-generation-persistence.js'
import { isProviderApiError, sendProviderJsonRequest } from '../media/provider/media-provider-transport.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../../utils/task-logger.js'
import { buildDefectCheckCallback } from './video-defect-check-binding.js'
import { captureAndPersistTailFrame, notifyAutomationAfterVideo } from '../automation/video-side-effects.js'
import {
  persistPendingVideoSettlement,
  resolveVideoGenerationUserId,
  settleCompletedVideo,
} from '../billing/video-billing.js'
import { shouldRefreshProviderTaskStatus } from '../automation/video-task-refresh-policy.js'

type GenerateVideoParams = VideoGenerationEnqueueParams
export type VideoGenerationRefreshResult = 'missing' | 'idle' | 'processing' | 'completed' | 'failed'

export async function generateVideo(params: GenerateVideoParams): Promise<number> {
  const ts = now()
  const config = params.configId
    ? await getConfigById(params.configId)
    : await getActiveConfig('video')
  if (!config) throw new Error('No active video AI config')

  const res = (await db.insert(schema.videoGenerations)
    .values(buildVideoGenerationEnqueueRecord({ params, config, enqueuedAt: ts }))
    .run())

  const lastId = Number(res.lastInsertRowid)
  logTaskStart('VideoTask', 'enqueue', buildVideoGenerationEnqueueStartContext({
    id: lastId,
    params,
    config,
  }))
  logTaskPayload('VideoTask', 'enqueue params', buildMediaGenerationEnqueuePayload({
    id: lastId,
    config,
    params,
  }))
  processVideoGeneration(lastId, config).catch((error: unknown) => {
    logDetachedMediaJobError({
      taskName: 'VideoTask',
      event: 'process',
      id: lastId,
      error,
    }, {
      logError: logTaskError,
    })
    console.error(`Video generation ${lastId} failed:`, error)
  })
  return lastId
}

async function processVideoGeneration(id: number, config: AIConfig) {
  const adapter = getVideoAdapter(config.provider)
  const persistence = createVideoGenerationDbPersistence(id)

  try {
    const loadedRecord = await loadMediaGenerationRecord(id, async (jobId) => {
      return await db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, jobId)).all()
    })
    if (loadedRecord.type === 'missing') return

    const record = loadedRecord.record
    logTaskProgress('VideoTask', 'build-request', buildVideoGenerationRequestContext({
      id,
      provider: config.provider,
      record,
    }))

    const referenceResolverDeps = {
      readImageAsCompressedDataUrl,
      uploadStaticAssetToCos,
      warn: (event: string, payload: { path: string; error: string }) => logTaskWarn('VideoTask', event, payload),
    }
    const resolvedReferences = await resolveVideoGenerationReferences(record, referenceResolverDeps)

    const { normalizedSpec, providerRequest } = assembleVideoGenerateRequest({
      adapter,
      config,
      record,
      resolvedReferences,
    })

    const preparedGeneration = prepareProviderGenerationAttempt({
      id,
      config,
      providerRequest,
      extraLogContext: {
        model: record.model,
        referenceMode: record.referenceMode,
      },
      redactUrl,
    })
    logTaskProgress('VideoTask', 'request', preparedGeneration.requestLogContext)
    logTaskPayload('VideoTask', 'request payload', preparedGeneration.requestPayload)

    const result = await submitProviderGenerationRequest({
      normalizedSpec,
      providerRequest,
    }, {
      now,
      sendJsonRequest: sendProviderJsonRequest,
      persistSnapshot: persistence.persistSnapshot,
    })

    const generationResult = interpretVideoGenerateResult(adapter, result)

    if (generationResult.type === 'completed-url') {
      logTaskProgress('VideoTask', 'sync-complete', { id, videoUrl: generationResult.videoUrl })
      await completeGeneratedVideo(id, { type: 'url', videoUrl: generationResult.videoUrl }, record.duration, record.storyboardId)
      return
    }

    if (generationResult.type === 'missing-output') {
      throw new Error(generationResult.message)
    }

    const taskId = generationResult.taskId
    await recordMediaJobProcessingHandoff({
      taskName: 'VideoTask',
      event: 'poll-start',
      id,
      taskId,
      provider: config.provider,
      updatedAt: now(),
    }, {
      logProgress: logTaskProgress,
      persistProcessing: persistence.persistProcessing,
    })

    if (adapter.provider === 'vidu') {
      logTaskProgress('VideoTask', 'webhook-wait', { id, taskId, provider: adapter.provider })
      return
    }

    pollVideoTask(id, config, taskId, buildVideoGenerationPollingContext(record))
  } catch (error: unknown) {
    await recordMediaJobFailure({
      taskName: 'VideoTask',
      event: 'process',
      id,
      provider: config.provider,
      error,
      failedAt: now(),
    }, {
      logError: logTaskError,
      persistFailure: persistence.persistFailure,
    })
    const recordForStoryboard = await db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id))
    await notifyAutomationAfterVideo(id, recordForStoryboard[0]?.storyboardId ?? null, 'failed')
  }
}

async function pollVideoTask(
  id: number,
  config: AIConfig,
  taskId: string,
  context: { storyboardId?: number | null; duration?: number | null },
) {
  const adapter = getVideoAdapter(config.provider)
  const persistence = createVideoGenerationDbPersistence(id)
  const storyboardId = context.storyboardId

  const pollResult = await runMediaPollingLoop<void>({
    maxAttempts: 300,
    delayMs: 10000,
    onRetry: ({ attemptNumber, error }) => {
      logTaskWarn('VideoTask', 'poll-retry', { id, taskId, attempt: attemptNumber, error: error.message })
    },
    attempt: async ({ attemptNumber }) => {
      const preparedPoll = prepareProviderPollAttempt({
        id,
        taskId,
        attemptNumber,
        config,
        adapter,
        redactUrl,
      })
      logTaskProgress('VideoTask', 'poll-request', preparedPoll.logContext)

      const providerPoll = await submitProviderPollAttempt({
        providerRequest: preparedPoll.providerRequest,
      }, {
        now,
        isProviderApiError,
        sendJsonRequest: sendProviderJsonRequest,
        persistSnapshot: persistence.persistSnapshot,
      })
      if (providerPoll.type === 'continue') return { type: 'continue' }

      const result = providerPoll.result
      const pollDecision = interpretVideoPollResult(adapter, result)

      if (pollDecision.type === 'completed-url') {
        logTaskSuccess('VideoTask', 'poll-complete', { id, taskId, videoUrl: pollDecision.videoUrl })
        await persistVideoProviderUsage(persistence, pollDecision.providerUsage)
        await completeGeneratedVideo(id, { type: 'url', videoUrl: pollDecision.videoUrl }, context.duration, storyboardId)
        return { type: 'done', value: undefined }
      }

      if (pollDecision.type === 'failed') {
        logTaskError('VideoTask', 'poll-failed', { id, taskId, error: pollDecision.error })
        await recordMediaJobFailure({
          taskName: 'VideoTask',
          event: 'poll-failed',
          id,
          provider: config.provider,
          error: new Error(pollDecision.error),
          failedAt: now(),
        }, {
          logError: logTaskError,
          persistFailure: persistence.persistFailure,
        })
        await notifyAutomationAfterVideo(id, storyboardId ?? null, 'failed')
        return { type: 'done', value: undefined }
      }

      return { type: 'continue' }
    },
  })

  if (pollResult.status === 'done') return

  const errorMessage = pollResult.status === 'exhausted'
    ? 'Polling attempts exhausted'
    : pollResult.error.message
  logTaskWarn('VideoTask', 'poll-unconfirmed', { id, taskId, error: errorMessage })
  await persistence.persistProcessing(buildJobProviderTaskUnconfirmedPatch(taskId, errorMessage, now()))
}

export async function refreshVideoGenerationStatus(id: number): Promise<VideoGenerationRefreshResult> {
  const [record] = await db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id))
  if (!record) return 'missing'

  const taskId = record.taskId?.trim()
  if (!taskId) {
    const status = record.status ?? 'pending'
    return status === 'pending' || status === 'processing' ? 'processing' : 'idle'
  }
  if (!shouldRefreshProviderTaskStatus(record)) return 'idle'

  const config = await getActiveConfig('video')
  if (!config) throw new Error('No active video AI config')
  if (record.provider && config.provider && record.provider !== config.provider) {
    throw new Error(`Active video provider ${config.provider} does not match generation provider ${record.provider}`)
  }

  const adapter = getVideoAdapter(config.provider)
  const persistence = createVideoGenerationDbPersistence(id)
  const preparedPoll = prepareProviderPollAttempt({
    id,
    taskId,
    attemptNumber: 1,
    config,
    adapter,
    redactUrl,
  })
  logTaskProgress('VideoTask', 'resume-poll-request', preparedPoll.logContext)

  const providerPoll = await submitProviderPollAttempt({
    providerRequest: preparedPoll.providerRequest,
  }, {
    now,
    isProviderApiError,
    sendJsonRequest: sendProviderJsonRequest,
    persistSnapshot: persistence.persistSnapshot,
  })
  if (providerPoll.type === 'continue') {
    await persistence.persistProcessing(buildJobProviderTaskUnconfirmedPatch(taskId, 'Provider task still processing', now()))
    return 'processing'
  }

  const pollDecision = interpretVideoPollResult(adapter, providerPoll.result)
  if (pollDecision.type === 'completed-url') {
    logTaskSuccess('VideoTask', 'resume-poll-complete', {
      id,
      taskId,
      videoUrl: pollDecision.videoUrl,
    })
    await persistVideoProviderUsage(persistence, pollDecision.providerUsage)
    await completeGeneratedVideo(id, { type: 'url', videoUrl: pollDecision.videoUrl }, record.duration, record.storyboardId)
    return 'completed'
  }

  if (pollDecision.type === 'failed') {
    logTaskError('VideoTask', 'resume-poll-failed', { id, taskId, error: pollDecision.error })
    await recordMediaJobFailure({
      taskName: 'VideoTask',
      event: 'resume-poll-failed',
      id,
      provider: config.provider,
      error: new Error(pollDecision.error),
      failedAt: now(),
    }, {
      logError: logTaskError,
      persistFailure: persistence.persistFailure,
    })
    await notifyAutomationAfterVideo(id, record.storyboardId ?? null, 'failed')
    return 'failed'
  }

  return 'processing'
}

function serializeProviderUsageRaw(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw === 'string') return raw
  try {
    return JSON.stringify(raw)
  } catch {
    return null
  }
}

function buildVideoProviderUsagePatch(providerUsage?: ProviderUsage) {
  if (!providerUsage) return null

  const patch: Record<string, unknown> = {}
  if (typeof providerUsage.completionTokens === 'number') {
    patch.providerUsageCompletionTokens = Math.round(providerUsage.completionTokens)
  }
  if (typeof providerUsage.totalTokens === 'number') {
    patch.providerUsageTotalTokens = Math.round(providerUsage.totalTokens)
  }

  const raw = serializeProviderUsageRaw(providerUsage.raw)
  if (raw) patch.providerUsageRaw = raw

  return Object.keys(patch).length ? patch : null
}

async function persistVideoProviderUsage(
  persistence: ReturnType<typeof createVideoGenerationDbPersistence>,
  providerUsage?: ProviderUsage,
) {
  const patch = buildVideoProviderUsagePatch(providerUsage)
  if (!patch) return
  await persistence.persistVideoCompletion(patch)
}

async function completeGeneratedVideo(
  id: number,
  source: GeneratedVideoSource,
  duration: number | null | undefined,
  storyboardId?: number | null,
) {
  const persistence = createVideoGenerationDbPersistence(id)

  const result = await completeGeneratedVideoJob({
    id,
    source,
    duration,
    storyboardId,
  }, {
    now,
    downloadFile,
    uploadGeneratedAsset: uploadStaticAssetToCos,
    readVideoDuration: getVideoDurationPrecise,
    persistVideoCompletion: persistence.persistVideoCompletion,
    persistPendingVideoSettlement: async (patch) => {
      await persistPendingVideoSettlement({
        videoGenerationId: id,
        publicUrl: patch.pendingVideoUrl,
        localPath: patch.pendingLocalPath,
        durationSeconds: patch.pendingDurationSeconds,
        message: patch.billingError,
      })
    },
    publishStoryboardVideo: persistence.publishStoryboardVideo,
    logSuccess: logTaskSuccess,
    settleVideoCompletion: async (settlement) => {
      const ownerUserId = await resolveVideoGenerationUserId(id)
      if (!ownerUserId) throw new Error('Video generation owner not found')
      const status = await settleCompletedVideo({
        userId: ownerUserId,
        videoGenerationId: id,
        videoUrl: settlement.publicUrl,
        localPath: settlement.localPath,
        durationSeconds: settlement.duration || 0,
      })
      if (status === 'billing_required') {
        return { status, message: '余额不足，请充值后继续结算' }
      }
      return { status }
    },
    defectCheck: buildDefectCheckCallback(async (params) => {
      return await generateVideo({
        userId: params.userId ?? undefined,
        storyboardId: params.storyboardId ?? undefined,
        dramaId: params.dramaId ?? undefined,
        prompt: params.prompt,
        model: params.model ?? undefined,
        referenceMode: params.referenceMode ?? undefined,
        imageUrl: params.imageUrl ?? undefined,
        firstFrameUrl: params.firstFrameUrl ?? undefined,
        lastFrameUrl: params.lastFrameUrl ?? undefined,
        referenceImageUrls: params.referenceImageUrls ?? undefined,
        referenceVideoUrls: params.referenceVideoUrls ?? undefined,
        referenceAudioUrls: params.referenceAudioUrls ?? undefined,
        duration: params.duration ?? undefined,
        aspectRatio: params.aspectRatio ?? undefined,
        configId: params.configId ?? undefined,
        defectCheckAttempt: params.defectCheckAttempt,
        defectCheckParentId: params.defectCheckParentId,
      })
    }),
  })

  if (result.action === 'regenerate') return
  if (result.action === 'billing_required') return
  if (result.action === 'failed') {
    await notifyAutomationAfterVideo(id, storyboardId ?? null, 'failed')
    return
  }

  try {
    await captureAndPersistTailFrame(id, result.localPath)
  } catch (err) {
    console.warn('[automation] captureLastFrame failed', err)
  }
  await notifyAutomationAfterVideo(id, storyboardId ?? null, 'ok')
}
