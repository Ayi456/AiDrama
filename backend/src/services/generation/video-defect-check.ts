import type { VisionAnalyzeResult } from '../adapters/qwen-vision.js'

export type DefectCheckVerdict =
  | 'skipped' | 'complete' | 'defect' | 'defect_exhausted' | 'unknown'

export type DefectCheckAction = 'publish' | 'regenerate' | 'failed'

export interface DefectVisionConfig {
  baseUrl: string
  apiKey: string
  model: string
  enabled: boolean
  maxAttempts: number
}

export interface DefectCheckInput {
  videoUrl: string
  attemptNumber: number
  visionConfig: DefectVisionConfig | null
  prompt: string
  analyze: (params: {
    videoUrl: string
    prompt: string
    baseUrl: string
    apiKey: string
    model: string
  }) => Promise<VisionAnalyzeResult>
}

export interface DefectCheckDecision {
  action: DefectCheckAction
  verdict: DefectCheckVerdict
  missingActions: string[]
  rawText: string
  error: string | null
  model: string | null
  attemptedAt: string
}

export function clampMaxAttempts(value: unknown, fallback = 2): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(5, Math.max(1, Math.trunc(n)))
}

function emptyDecision(verdict: DefectCheckVerdict, model: string | null, error: string | null): DefectCheckDecision {
  return {
    action: 'publish',
    verdict,
    missingActions: [],
    rawText: '',
    error,
    model,
    attemptedAt: new Date().toISOString(),
  }
}

export async function runDefectCheck(input: DefectCheckInput): Promise<DefectCheckDecision> {
  if (!input.visionConfig) {
    return emptyDecision('skipped', null, 'no_vision_config')
  }
  if (!input.visionConfig.enabled) {
    return emptyDecision('skipped', input.visionConfig.model, 'disabled')
  }

  const cfg = input.visionConfig
  let result: VisionAnalyzeResult
  try {
    result = await input.analyze({
      videoUrl: input.videoUrl,
      prompt: input.prompt,
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ...emptyDecision('unknown', cfg.model, message),
    }
  }

  const attemptedAt = new Date().toISOString()
  if (result.verdict === 'complete') {
    return {
      action: 'publish',
      verdict: 'complete',
      missingActions: [],
      rawText: result.rawText,
      error: null,
      model: cfg.model,
      attemptedAt,
    }
  }
  if (result.verdict === 'unknown') {
    return {
      action: 'publish',
      verdict: 'unknown',
      missingActions: [],
      rawText: result.rawText,
      error: 'unparseable',
      model: cfg.model,
      attemptedAt,
    }
  }
  // defect
  const willExhaust = input.attemptNumber + 1 >= cfg.maxAttempts
  return {
    action: willExhaust ? 'failed' : 'regenerate',
    verdict: willExhaust ? 'defect_exhausted' : 'defect',
    missingActions: result.missingActions,
    rawText: result.rawText,
    error: null,
    model: cfg.model,
    attemptedAt,
  }
}
