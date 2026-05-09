export type MediaPollingAttemptContext = {
  attemptNumber: number
  remainingMs?: number
}

export type MediaPollingDecision<T> =
  | { type: 'continue' }
  | { type: 'done'; value: T }

export type MediaPollingResult<T> =
  | { status: 'done'; value: T }
  | { status: 'timeout'; error: Error }
  | { status: 'failed'; error: Error }
  | { status: 'exhausted' }

export type MediaPollingLoopOptions<T> = {
  maxAttempts: number
  delayMs: number
  maxDurationMs?: number
  timeoutMessage?: string
  sleep?: (delayMs: number) => Promise<void>
  now?: () => number
  onRetry?: (payload: { attemptNumber: number; error: Error }) => void | Promise<void>
  attempt: (context: MediaPollingAttemptContext) => Promise<MediaPollingDecision<T>>
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function defaultSleep(delayMs: number) {
  return new Promise<void>(resolve => setTimeout(resolve, delayMs))
}

export async function runMediaPollingLoop<T>(options: MediaPollingLoopOptions<T>): Promise<MediaPollingResult<T>> {
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const timeoutMessage = options.timeoutMessage ?? 'Polling deadline exceeded'
  const startedAt = now()

  const buildTimeoutResult = (): MediaPollingResult<T> => ({
    status: 'timeout',
    error: new Error(timeoutMessage),
  })

  const hasTimedOut = () => (
    options.maxDurationMs !== undefined
    && now() - startedAt >= options.maxDurationMs
  )

  const remainingDuration = () => (
    options.maxDurationMs === undefined
      ? undefined
      : Math.max(0, options.maxDurationMs - (now() - startedAt))
  )

  for (let attemptNumber = 1; attemptNumber <= options.maxAttempts; attemptNumber++) {
    if (hasTimedOut()) return buildTimeoutResult()

    await sleep(options.delayMs)

    if (hasTimedOut()) return buildTimeoutResult()

    try {
      const decision = await options.attempt({
        attemptNumber,
        remainingMs: remainingDuration(),
      })
      if (decision.type === 'done') {
        return { status: 'done', value: decision.value }
      }
    } catch (error) {
      const normalizedError = asError(error)
      if (hasTimedOut()) {
        return { status: 'timeout', error: normalizedError }
      }
      if (attemptNumber === options.maxAttempts) {
        return { status: 'failed', error: normalizedError }
      }
      await options.onRetry?.({ attemptNumber, error: normalizedError })
    }
  }

  return { status: 'exhausted' }
}
