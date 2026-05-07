import assert from 'node:assert/strict'

import { runMediaPollingLoop } from '../media-polling-loop.js'

function runTest(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`PASS ${name}`)
    })
    .catch((error) => {
      console.error(`FAIL ${name}`)
      throw error
    })
}

runTest('runMediaPollingLoop waits before each attempt and returns completed values', async () => {
  const sleeps: number[] = []
  const attempts: Array<{ attemptNumber: number; remainingMs?: number }> = []
  let currentTime = 0

  const result = await runMediaPollingLoop({
    maxAttempts: 3,
    delayMs: 5,
    maxDurationMs: 100,
    now: () => currentTime,
    sleep: async (delayMs: number) => {
      sleeps.push(delayMs)
      currentTime += delayMs
    },
    attempt: async (context: { attemptNumber: number; remainingMs?: number }) => {
      attempts.push(context)
      return context.attemptNumber === 2
        ? { type: 'done', value: 'completed-url' }
        : { type: 'continue' }
    },
  })

  assert.deepEqual(sleeps, [5, 5])
  assert.deepEqual(attempts, [
    { attemptNumber: 1, remainingMs: 95 },
    { attemptNumber: 2, remainingMs: 90 },
  ])
  assert.deepEqual(result, { status: 'done', value: 'completed-url' })
})

runTest('runMediaPollingLoop returns timeout when the wait reaches the deadline', async () => {
  let currentTime = 0
  let attemptCount = 0

  const result = await runMediaPollingLoop({
    maxAttempts: 3,
    delayMs: 10,
    maxDurationMs: 10,
    timeoutMessage: 'Polling exceeded test window',
    now: () => currentTime,
    sleep: async (delayMs: number) => {
      currentTime += delayMs
    },
    attempt: async () => {
      attemptCount += 1
      return { type: 'continue' }
    },
  })

  assert.equal(attemptCount, 0)
  assert.equal(result.status, 'timeout')
  if (result.status === 'timeout') {
    assert.equal(result.error.message, 'Polling exceeded test window')
  }
})

runTest('runMediaPollingLoop reports retries and returns the final failed attempt', async () => {
  const retries: Array<{ attemptNumber: number; error: string }> = []

  const result = await runMediaPollingLoop({
    maxAttempts: 3,
    delayMs: 1,
    sleep: async () => {},
    onRetry: ({ attemptNumber, error }: { attemptNumber: number; error: unknown }) => {
      retries.push({ attemptNumber, error: (error as Error).message })
    },
    attempt: async () => {
      throw new Error('provider still unavailable')
    },
  })

  assert.deepEqual(retries, [
    { attemptNumber: 1, error: 'provider still unavailable' },
    { attemptNumber: 2, error: 'provider still unavailable' },
  ])
  assert.equal(result.status, 'failed')
  if (result.status === 'failed') {
    assert.equal(result.error.message, 'provider still unavailable')
  }
})
