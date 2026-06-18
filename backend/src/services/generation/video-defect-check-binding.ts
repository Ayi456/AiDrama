import { and, eq, or } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { now } from '../../utils/response.js'
import { logTaskProgress, logTaskStart, logTaskSuccess } from '../../utils/task-logger.js'
import { analyzeVideoForDefects } from '../adapters/qwen-vision.js'
import { DEFECT_CHECK_PROMPT } from '../../utils/defect-check-prompt.js'
import type { DefectCheckCallback } from '../media/assets/media-completion.js'
import {
  clampMaxAttempts,
  runDefectCheck,
  type DefectVisionConfig,
} from './video-defect-check.js'
import {
  enqueueDefectRegeneration,
  type RegenEnqueueParams,
} from './video-regeneration.js'

async function loadActiveVisionConfig(): Promise<DefectVisionConfig | null> {
  const rows = await db
    .select()
    .from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, 'vision'))
    .all()
  const active = rows.find((r) => r.isActive !== false)
  if (!active || !active.baseUrl || !active.apiKey) return null
  let parsedSettings: Record<string, unknown> = {}
  if (active.settings) {
    try {
      const parsed = JSON.parse(active.settings)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsedSettings = parsed as Record<string, unknown>
      }
    } catch {}
  }
  let model = ''
  if (active.model) {
    try {
      const parsed = JSON.parse(active.model)
      if (Array.isArray(parsed) && typeof parsed[0] === 'string') model = parsed[0]
    } catch {
      if (typeof active.model === 'string') model = active.model
    }
  }
  return {
    baseUrl: active.baseUrl,
    apiKey: active.apiKey,
    model: model || 'qwen3.6-plus',
    enabled: parsedSettings.enabled === true,
    maxAttempts: clampMaxAttempts(parsedSettings.maxAttempts, 2),
  }
}

async function loadVideoGenerationRow(id: number) {
  const [row] = await db
    .select()
    .from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.id, id))
    .all()
  return row ?? null
}

function mutationAffectedRows(result: unknown) {
  if (!result || typeof result !== 'object') return 0
  const affectedRows = (result as { affectedRows?: unknown }).affectedRows
  const count = Number(affectedRows)
  return Number.isFinite(count) ? count : 0
}

function errorMessageFromUnknown(error: unknown) {
  if (error instanceof Error) return error.message || 'Unknown error'
  if (typeof error === 'string') return error || 'Unknown error'
  return 'Unknown error'
}

async function claimDefectCheck(rowId: number) {
  const result = await db
    .update(schema.videoGenerations)
    .set({ status: 'checking_defect', updatedAt: now() })
    .where(and(
      eq(schema.videoGenerations.id, rowId),
      or(
        eq(schema.videoGenerations.status, 'pending'),
        eq(schema.videoGenerations.status, 'processing'),
      ),
    ))
    .run()
  return mutationAffectedRows(result) > 0
}

export type RegenEnqueueFn = (params: RegenEnqueueParams) => Promise<number>

export function buildDefectCheckCallback(enqueueGenerate: RegenEnqueueFn): DefectCheckCallback {
  return async ({ id: rowId, publicUrl }) => {
    const row = await loadVideoGenerationRow(rowId)
    if (!row) return { action: 'publish' }
    const claimed = await claimDefectCheck(rowId)
    if (!claimed) {
      logTaskProgress('VideoDefectCheck', 'already-claimed', {
        id: rowId,
        status: row.status,
      })
      return { action: 'regenerate' }
    }

    const visionConfig = await loadActiveVisionConfig()
    const attemptNumber = typeof row.defectCheckAttempt === 'number' ? row.defectCheckAttempt : 0

    logTaskStart('VideoDefectCheck', 'start', {
      id: rowId,
      attemptNumber,
      hasConfig: !!visionConfig,
    })

    const decision = await runDefectCheck({
      videoUrl: publicUrl,
      attemptNumber,
      visionConfig,
      prompt: DEFECT_CHECK_PROMPT,
      analyze: analyzeVideoForDefects,
    })

    logTaskProgress('VideoDefectCheck', 'decision', {
      id: rowId,
      action: decision.action,
      verdict: decision.verdict,
      model: decision.model,
      error: decision.error,
    })

    await db
      .update(schema.videoGenerations)
      .set({ defectCheckResult: JSON.stringify(decision), updatedAt: now() })
      .where(eq(schema.videoGenerations.id, rowId))
      .run()

    if (decision.action === 'regenerate') {
      await db
        .update(schema.videoGenerations)
        .set({
          status: 'checking_defect',
          errorMsg: '检测判定穿帮，正在发起重生成',
          updatedAt: now(),
        })
        .where(eq(schema.videoGenerations.id, rowId))
        .run()
      let newId: number
      try {
        newId = await enqueueDefectRegeneration({
          originalRecord: {
            id: row.id,
            userId: row.userId,
            prompt: row.prompt,
            model: row.model,
            configId: undefined,
            storyboardId: row.storyboardId,
            imageUrl: row.imageUrl,
            firstFrameUrl: row.firstFrameUrl,
            lastFrameUrl: row.lastFrameUrl,
            duration: row.duration,
            fps: row.fps,
            resolution: row.resolution,
            aspectRatio: row.aspectRatio,
            defectCheckAttempt: row.defectCheckAttempt,
            dramaId: row.dramaId,
            referenceMode: row.referenceMode,
            referenceImageUrls: row.referenceImageUrls,
            referenceVideoUrls: row.referenceVideoUrls,
            referenceAudioUrls: row.referenceAudioUrls,
          },
          missingActions: decision.missingActions,
          enqueue: enqueueGenerate,
        })
      } catch (error) {
        const message = errorMessageFromUnknown(error)
        await db
          .update(schema.videoGenerations)
          .set({
            status: 'failed',
            errorMsg: `缺陷检测判定穿帮，但重生成入队失败：${message}`,
            updatedAt: now(),
          })
          .where(eq(schema.videoGenerations.id, rowId))
          .run()
        logTaskProgress('VideoDefectCheck', 'regenerate-enqueue-failed', {
          id: rowId,
          error: message,
        })
        return { action: 'failed' }
      }
      await db
        .update(schema.videoGenerations)
        .set({
          status: 'failed_defect',
          errorMsg: '检测判定穿帮，已发起重生成',
          updatedAt: now(),
        })
        .where(eq(schema.videoGenerations.id, rowId))
        .run()
      logTaskSuccess('VideoDefectCheck', 'regenerate-enqueued', {
        id: rowId,
        newId,
        parentId: rowId,
      })
    }

    if (decision.action === 'failed') {
      await db
        .update(schema.videoGenerations)
        .set({
          status: 'failed_defect',
          errorMsg: '检测判定穿帮，已达到最大重生成次数，未发布',
          updatedAt: now(),
        })
        .where(eq(schema.videoGenerations.id, rowId))
        .run()
    }

    return { action: decision.action }
  }
}
