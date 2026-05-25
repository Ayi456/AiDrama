import { eq } from 'drizzle-orm'
import { db, schema } from '../../db/index.js'
import { AutomationStage, handlers, nextStage } from './stage-handlers.js'

export type AutomationStatus = 'idle' | 'running' | 'paused' | 'failed' | 'done'

export type AdvanceInput = {
  status: AutomationStatus
  stage: AutomationStage
  attempt: number
  isComplete: boolean
  maxRetries: number
  lastError?: string | null
}

export type AdvanceDecision =
  | { type: 'noop'; reason: string }
  | { type: 'transition'; toStage: AutomationStage }
  | { type: 'finish' }
  | { type: 'retry' }
  | { type: 'fail' }

export function computeAdvanceDecision(input: AdvanceInput): AdvanceDecision {
  if (input.status !== 'running') return { type: 'noop', reason: 'not-running' }

  if (input.lastError && !input.isComplete) {
    if (input.attempt + 1 > input.maxRetries) return { type: 'fail' }
    return { type: 'retry' }
  }

  if (!input.isComplete) return { type: 'noop', reason: 'wait-for-completion' }

  if (input.stage === 'merge') return { type: 'finish' }
  return { type: 'transition', toStage: nextStage(input.stage) }
}

const inFlight = new Set<number>()

export async function start(episodeId: number): Promise<{ ok: boolean; status: AutomationStatus; message?: string }> {
  const rows = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  if (!rows.length) return { ok: false, status: 'idle', message: 'episode not found' }
  const ep = rows[0]
  if (ep.automationStatus !== 'idle' && ep.automationStatus !== 'done') {
    return { ok: false, status: (ep.automationStatus ?? 'idle') as AutomationStatus, message: 'already running or paused' }
  }
  const now = new Date().toISOString()
  await db.update(schema.episodes).set({
    automationStatus: 'running',
    automationStage: 'extract',
    automationAttempt: 0,
    automationError: null,
    updatedAt: now,
  }).where(eq(schema.episodes.id, episodeId))

  void advance(episodeId)
  return { ok: true, status: 'running' }
}

async function loadMaxRetries(): Promise<number> {
  const rows = await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, 'default'))
  return rows[0]?.autoPipelineMaxRetries ?? 2
}

export async function advance(episodeId: number): Promise<void> {
  if (inFlight.has(episodeId)) return
  inFlight.add(episodeId)
  try {
    while (true) {
      const rows = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
      if (!rows.length) return
      const ep = rows[0]
      const status = (ep.automationStatus ?? 'idle') as AutomationStatus
      if (status !== 'running') return

      const stage = (ep.automationStage ?? 'extract') as AutomationStage
      if (stage === 'done') {
        await markStatus(episodeId, 'done')
        return
      }

      const handler = handlers[stage]
      const ctx = { episodeId, dramaId: ep.dramaId }
      let isComplete = false
      let stageError: string | null = null
      try {
        isComplete = await handler.isComplete(ctx)
        if (!isComplete) {
          await handler.enter(ctx)
          isComplete = await handler.isComplete(ctx)
        }
      } catch (err: any) {
        stageError = err?.message || String(err)
      }

      const decision = computeAdvanceDecision({
        status: 'running',
        stage,
        attempt: ep.automationAttempt ?? 0,
        isComplete,
        maxRetries: await loadMaxRetries(),
        lastError: stageError,
      })

      const now = new Date().toISOString()
      if (decision.type === 'transition') {
        await db.update(schema.episodes).set({
          automationStage: decision.toStage,
          automationAttempt: 0,
          automationError: null,
          updatedAt: now,
        }).where(eq(schema.episodes.id, episodeId))
        continue
      }
      if (decision.type === 'finish') {
        await db.update(schema.episodes).set({
          automationStage: 'done',
          automationStatus: 'done',
          automationError: null,
          updatedAt: now,
        }).where(eq(schema.episodes.id, episodeId))
        return
      }
      if (decision.type === 'retry') {
        await db.update(schema.episodes).set({
          automationAttempt: (ep.automationAttempt ?? 0) + 1,
          automationError: stageError,
          updatedAt: now,
        }).where(eq(schema.episodes.id, episodeId))
        continue
      }
      if (decision.type === 'fail') {
        await db.update(schema.episodes).set({
          automationStatus: 'failed',
          automationError: stageError ?? 'unknown',
          updatedAt: now,
        }).where(eq(schema.episodes.id, episodeId))
        return
      }
      return
    }
  } finally {
    inFlight.delete(episodeId)
  }
}

async function markStatus(episodeId: number, status: AutomationStatus) {
  await db.update(schema.episodes).set({
    automationStatus: status,
    updatedAt: new Date().toISOString(),
  }).where(eq(schema.episodes.id, episodeId))
}
