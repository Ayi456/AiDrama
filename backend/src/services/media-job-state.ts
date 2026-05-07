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

export function buildJobProcessingPatch(taskId: string | null | undefined, updatedAt: string) {
  return {
    taskId,
    status: 'processing' as const,
    updatedAt,
  }
}

export function buildJobFailurePatch(error: unknown, updatedAt: string) {
  return {
    status: 'failed' as const,
    errorMsg: normalizeJobErrorMessage(error),
    updatedAt,
  }
}
