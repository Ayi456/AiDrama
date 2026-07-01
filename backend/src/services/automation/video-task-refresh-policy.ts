export type RefreshableVideoGeneration = {
  id: number
  status?: string | null
  taskId?: string | null
  errorMsg?: string | null
  defectCheckParentId?: number | null
}

const LOCAL_PROVIDER_TASK_FAILURE_MARKERS = [
  'polling attempts exhausted',
  'polling deadline exceeded',
  'automation reset stale video generation',
  'stale video generation expired',
  'provider task status unconfirmed',
]

export function shouldRefreshProviderTaskStatus(row: RefreshableVideoGeneration) {
  const taskId = row.taskId?.trim()
  if (!taskId) return false

  const status = (row.status ?? 'pending').toLowerCase()
  if (status === 'pending' || status === 'processing') return true
  if (status !== 'failed') return false

  const message = (row.errorMsg ?? '').toLowerCase()
  return LOCAL_PROVIDER_TASK_FAILURE_MARKERS.some(marker => message.includes(marker))
}

export function selectRefreshableVideoGeneration<T extends RefreshableVideoGeneration>(rows: T[]): T | null {
  const candidates = rows.filter(row => shouldRefreshProviderTaskStatus(row))
  return candidates.sort((a, b) => b.id - a.id)[0] ?? null
}
