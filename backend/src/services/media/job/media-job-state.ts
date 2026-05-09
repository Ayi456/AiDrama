export type MediaJobSnapshotField =
  | 'normalizedRequest'
  | 'providerRequest'
  | 'providerResponse'

export function serializeJobPayload(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

export function normalizeJobErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function buildJobSnapshotPatch(field: MediaJobSnapshotField, value: unknown, updatedAt: string) {
  return {
    [field]: serializeJobPayload(value),
    updatedAt,
  }
}

export type MediaJobSnapshotPatch = ReturnType<typeof buildJobSnapshotPatch>

export type CreateMediaJobSnapshotPersistorDeps = {
  persistPatch: (patch: MediaJobSnapshotPatch) => Promise<void>
}

export function createMediaJobSnapshotPersistor(deps: CreateMediaJobSnapshotPersistorDeps) {
  return async (field: MediaJobSnapshotField, payload: unknown, updatedAt: string) => {
    await deps.persistPatch(buildJobSnapshotPatch(field, payload, updatedAt))
  }
}

export function buildJobProcessingPatch(taskId: string | null | undefined, updatedAt: string) {
  return {
    taskId,
    status: 'processing' as const,
    updatedAt,
  }
}

export type MediaJobProcessingPatch = ReturnType<typeof buildJobProcessingPatch>

export type MediaJobProcessingHandoffInput = {
  taskName: string
  event: string
  id: number
  taskId: string
  provider: string
  updatedAt: string
}

export type MediaJobProcessingLogPayload = {
  id: number
  taskId: string
  provider: string
}

export type RecordMediaJobProcessingHandoffDeps = {
  logProgress: (taskName: string, event: string, payload: MediaJobProcessingLogPayload) => void
  persistProcessing: (patch: MediaJobProcessingPatch) => Promise<void>
}

export async function recordMediaJobProcessingHandoff(
  input: MediaJobProcessingHandoffInput,
  deps: RecordMediaJobProcessingHandoffDeps,
) {
  await deps.persistProcessing(buildJobProcessingPatch(input.taskId, input.updatedAt))
  deps.logProgress(input.taskName, input.event, {
    id: input.id,
    taskId: input.taskId,
    provider: input.provider,
  })
}

export function buildJobFailurePatch(error: unknown, updatedAt: string) {
  return {
    status: 'failed' as const,
    errorMsg: normalizeJobErrorMessage(error),
    updatedAt,
  }
}

export type MediaJobFailureInput = {
  taskName: string
  event: string
  id: number
  provider?: string
  error: unknown
  failedAt: string
}

export type MediaJobFailureLogPayload = {
  id: number
  provider?: string
  error: string
}

export type RecordMediaJobFailureDeps = {
  logError: (taskName: string, event: string, payload: MediaJobFailureLogPayload) => void
  persistFailure: (patch: ReturnType<typeof buildJobFailurePatch>) => Promise<void>
}

export type MediaJobTimeoutInput = {
  taskName: string
  event: string
  id: number
  taskId: string
  errorMessage: string
  failedAt: string
}

export type MediaJobTimeoutLogPayload = {
  id: number
  taskId: string
  error: string
}

export type RecordMediaJobTimeoutDeps = {
  logError: (taskName: string, event: string, payload: MediaJobTimeoutLogPayload) => void
  persistFailure: (patch: ReturnType<typeof buildJobFailurePatch>) => Promise<void>
}

export type DetachedMediaJobErrorInput = {
  taskName: string
  event: string
  id: number
  error: unknown
}

export type DetachedMediaJobErrorLogPayload = {
  id: number
  error: string
}

export type LogDetachedMediaJobErrorDeps = {
  logError: (taskName: string, event: string, payload: DetachedMediaJobErrorLogPayload) => void
}

export async function recordMediaJobFailure(
  input: MediaJobFailureInput,
  deps: RecordMediaJobFailureDeps,
) {
  const message = normalizeJobErrorMessage(input.error)
  deps.logError(input.taskName, input.event, {
    id: input.id,
    provider: input.provider,
    error: message,
  })
  await deps.persistFailure(buildJobFailurePatch(input.error, input.failedAt))
}

export async function recordMediaJobTimeout(
  input: MediaJobTimeoutInput,
  deps: RecordMediaJobTimeoutDeps,
) {
  deps.logError(input.taskName, input.event, {
    id: input.id,
    taskId: input.taskId,
    error: input.errorMessage,
  })
  await deps.persistFailure(buildJobFailurePatch(new Error(`Timeout: ${input.errorMessage}`), input.failedAt))
}

export function logDetachedMediaJobError(
  input: DetachedMediaJobErrorInput,
  deps: LogDetachedMediaJobErrorDeps,
) {
  deps.logError(input.taskName, input.event, {
    id: input.id,
    error: normalizeJobErrorMessage(input.error),
  })
}
