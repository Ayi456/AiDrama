import type { LiveProgressSnapshot } from '../../routes/policies/automation-route-policy.js'

const snapshots = new Map<number, LiveProgressSnapshot>()

export function setAutomationProgress(episodeId: number, snapshot: LiveProgressSnapshot): void {
  if (!Number.isFinite(episodeId) || episodeId <= 0) return
  snapshots.set(episodeId, snapshot)
}

export function getAutomationProgress(episodeId: number): LiveProgressSnapshot | null {
  return snapshots.get(episodeId) ?? null
}

export function clearAutomationProgress(episodeId: number): void {
  snapshots.delete(episodeId)
}
