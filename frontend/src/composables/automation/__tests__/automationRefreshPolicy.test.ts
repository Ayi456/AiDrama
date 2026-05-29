import assert from 'node:assert/strict'

import { shouldRefreshChapterForAutomationStatus } from '../automationRefreshPolicy.ts'
import type { AutomationStatusPayload } from '../../useApi.ts'

function status(overrides: Partial<AutomationStatusPayload> = {}): AutomationStatusPayload {
  return {
    status: 'running',
    stage: 'extract',
    attempt: 0,
    error: null,
    progress: { current: 0, total: 1, label: '提取角色与分镜' },
    ...overrides,
  }
}

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('automation status changes request a chapter refresh', () => {
  const result = shouldRefreshChapterForAutomationStatus('', status())
  assert.equal(result.shouldRefresh, true)
  assert.equal(result.signature, 'running|extract|0|1')
})

await runTest('unchanged automation status does not request another refresh', () => {
  const result = shouldRefreshChapterForAutomationStatus('running|extract|0|1', status())
  assert.equal(result.shouldRefresh, false)
  assert.equal(result.signature, 'running|extract|0|1')
})

await runTest('progress changes request a chapter refresh', () => {
  const result = shouldRefreshChapterForAutomationStatus(
    'running|extract|0|5',
    status({ progress: { current: 1, total: 5, label: '拆解分镜' } }),
  )
  assert.equal(result.shouldRefresh, true)
  assert.equal(result.signature, 'running|extract|1|5')
})

await runTest('initial idle status does not refresh the chapter', () => {
  const result = shouldRefreshChapterForAutomationStatus('', status({ status: 'idle' }))
  assert.equal(result.shouldRefresh, false)
  assert.equal(result.signature, 'idle|extract|0|1')
})
