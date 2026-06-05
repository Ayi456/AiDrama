export const STALE_VIDEO_GENERATION_NO_TASK_MS = 30 * 60 * 1000
export const STALE_VIDEO_GENERATION_WITH_TASK_MS = 2 * 60 * 60 * 1000

export type VideoGenerationInFlightInput = {
  status?: string | null
  taskId?: string | null
  updatedAt?: string | null
  createdAt?: string | null
  defectCheckParentId?: number | null
}

export type VideoGenerationInFlightState = {
  inFlight: boolean
  stale: boolean
  reason: string | null
}

export function getVideoGenerationInFlightState(
  row: VideoGenerationInFlightInput,
  nowMs = Date.now(),
): VideoGenerationInFlightState {
  const status = row.status ?? 'pending'
  if (status !== 'pending' && status !== 'processing' && status !== 'checking_defect') return notInFlight()

  const lastTouchedMs = parseTimestampMs(row.updatedAt) ?? parseTimestampMs(row.createdAt)
  if (lastTouchedMs == null) return activeInFlight()

  const ageMs = nowMs - lastTouchedMs
  if (ageMs < 0) return activeInFlight()

  const taskId = row.taskId?.trim() || null
  const staleAfterMs = taskId
    ? STALE_VIDEO_GENERATION_WITH_TASK_MS
    : STALE_VIDEO_GENERATION_NO_TASK_MS

  if (ageMs <= staleAfterMs) return activeInFlight()

  return {
    inFlight: false,
    stale: true,
    reason: taskId
      ? `Video generation timed out after ${formatMinutes(staleAfterMs)} minutes while waiting for provider task ${taskId}`
      : `Video generation missing provider task id after ${formatMinutes(staleAfterMs)} minutes`,
  }
}

function parseTimestampMs(value?: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatMinutes(ms: number) {
  return Math.round(ms / 60_000)
}

function activeInFlight(): VideoGenerationInFlightState {
  return { inFlight: true, stale: false, reason: null }
}

function notInFlight(): VideoGenerationInFlightState {
  return { inFlight: false, stale: false, reason: null }
}
