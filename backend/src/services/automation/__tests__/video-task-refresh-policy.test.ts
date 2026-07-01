import test from 'node:test'
import assert from 'node:assert/strict'
import {
  selectRefreshableVideoGeneration,
  shouldRefreshProviderTaskStatus,
} from '../video-task-refresh-policy.js'

test('selectRefreshableVideoGeneration picks the newest root in-flight task with task id', () => {
  const selected = selectRefreshableVideoGeneration([
    { id: 10, status: 'failed', taskId: null, defectCheckParentId: null },
    { id: 11, status: 'processing', taskId: null, defectCheckParentId: null },
    { id: 12, status: 'processing', taskId: 'task-old', defectCheckParentId: null },
    { id: 13, status: 'pending', taskId: 'task-new', defectCheckParentId: null },
  ])

  assert.equal(selected?.id, 13)
})

test('selectRefreshableVideoGeneration can refresh child regeneration tasks', () => {
  const selected = selectRefreshableVideoGeneration([
    { id: 20, status: 'processing', taskId: 'child-task', defectCheckParentId: 19 },
    { id: 19, status: 'processing', taskId: 'root-task', defectCheckParentId: null },
  ])

  assert.equal(selected?.id, 20)
})

test('selectRefreshableVideoGeneration returns null when no provider task can be polled', () => {
  const selected = selectRefreshableVideoGeneration([
    { id: 30, status: 'processing', taskId: null, defectCheckParentId: null },
    { id: 31, status: 'completed', taskId: 'done-task', defectCheckParentId: null },
  ])

  assert.equal(selected, null)
})

test('selectRefreshableVideoGeneration can recover local timeout failures with provider task ids', () => {
  const selected = selectRefreshableVideoGeneration([
    {
      id: 40,
      status: 'failed',
      taskId: 'timed-out-task',
      errorMsg: 'Timeout: Polling attempts exhausted',
      defectCheckParentId: null,
    },
    {
      id: 41,
      status: 'failed',
      taskId: 'provider-rejected-task',
      errorMsg: 'Sensitive content rejected by provider',
      defectCheckParentId: null,
    },
  ])

  assert.equal(selected?.id, 40)
})

test('shouldRefreshProviderTaskStatus separates local polling failures from provider terminal failures', () => {
  assert.equal(shouldRefreshProviderTaskStatus({
    id: 50,
    status: 'failed',
    taskId: 'task-50',
    errorMsg: 'Automation reset stale video generation: provider task status unknown',
  }), true)
  assert.equal(shouldRefreshProviderTaskStatus({
    id: 51,
    status: 'failed',
    taskId: 'task-51',
    errorMsg: 'Stale video generation expired: provider task status unknown',
  }), true)
  assert.equal(shouldRefreshProviderTaskStatus({
    id: 52,
    status: 'failed',
    taskId: 'task-52',
    errorMsg: 'Provider failed: sensitive content',
  }), false)
  assert.equal(shouldRefreshProviderTaskStatus({
    id: 53,
    status: 'processing',
    taskId: 'task-53',
  }), true)
})
