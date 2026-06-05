export type RefreshableVideoGeneration = {
  id: number
  status?: string | null
  taskId?: string | null
  defectCheckParentId?: number | null
}

export function selectRefreshableVideoGeneration<T extends RefreshableVideoGeneration>(rows: T[]): T | null {
  const candidates = rows.filter(row => {
    const status = row.status ?? 'pending'
    if (status !== 'pending' && status !== 'processing') return false
    return !!row.taskId?.trim()
  })

  return candidates.sort((a, b) => b.id - a.id)[0] ?? null
}
