import type { AutomationStage } from './stage-policy.js'
import type { AutomationStatus } from './episode-orchestrator.js'

export type VideoFailureDecisionInput = {
  status: AutomationStatus | string | null | undefined
  stage: AutomationStage | string | null | undefined
  attempt: number | null | undefined
  maxRetries: number
  errorMessage: string
}

export type VideoFailureDecision =
  | { type: 'ignore' }
  | { type: 'retry'; nextAttempt: number; error: string }
  | { type: 'fail'; nextAttempt: number; error: string }

export function computeVideoFailureDecision(input: VideoFailureDecisionInput): VideoFailureDecision {
  if (input.status !== 'running' || input.stage !== 'video') return { type: 'ignore' }

  const attempt = Math.max(0, input.attempt ?? 0)
  const nextAttempt = attempt + 1
  const error = input.errorMessage || 'Video generation failed'
  if (nextAttempt > input.maxRetries) return { type: 'fail', nextAttempt, error }
  return { type: 'retry', nextAttempt, error }
}
