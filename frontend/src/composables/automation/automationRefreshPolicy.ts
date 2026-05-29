import type { AutomationStatusPayload } from '../useApi'

export type AutomationRefreshDecision = {
  shouldRefresh: boolean
  signature: string
}

export function automationStatusSignature(status: AutomationStatusPayload | null | undefined): string {
  if (!status) return ''
  return [
    status.status,
    status.stage,
    status.progress.current,
    status.progress.total,
  ].join('|')
}

export function shouldRefreshChapterForAutomationStatus(
  previousSignature: string,
  status: AutomationStatusPayload | null | undefined,
): AutomationRefreshDecision {
  const signature = automationStatusSignature(status)
  const changed = Boolean(signature) && signature !== previousSignature
  const isInitialIdle = !previousSignature && status?.status === 'idle'
  return {
    shouldRefresh: changed && !isInitialIdle,
    signature,
  }
}
