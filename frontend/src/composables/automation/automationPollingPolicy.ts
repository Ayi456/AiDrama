export const AUTOMATION_POLL_MS = 2500
export const AUTOMATION_POLL_MAX_BACKOFF_MS = 10000

export function nextBackoffMs(consecutiveErrors: number): number {
  if (consecutiveErrors <= 0) return AUTOMATION_POLL_MS
  return Math.min(AUTOMATION_POLL_MS * Math.pow(2, consecutiveErrors), AUTOMATION_POLL_MAX_BACKOFF_MS)
}

export function isTerminalStatus(status: string): boolean {
  return status === 'done' || status === 'failed' || status === 'idle'
}
