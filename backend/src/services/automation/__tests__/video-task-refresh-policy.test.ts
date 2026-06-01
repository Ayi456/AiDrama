import test from 'node:test'
import assert from 'node:assert/strict'
import { selectRefreshableVideoGeneration } from '../video-task-refresh-policy.js'

test('selectRefreshableVideoGeneration picks the newest root in-flight task with task id', () => {
  const selected = selectRefreshableVideoGeneration([
    { id: 10, status: 'failed', taskId: null, defectCheckParentId: null },
    { id: 11, status: 'processing', taskId: null, defectCheckParentId: null },
    { id: 12, status: 'processing', taskId: 'task-old', defectCheckParentId: null },
    { id: 13, status: 'pending', taskId: 'task-new', defectCheckParentId: null },
  ])

  assert.equal(selected?.id, 13)
})

test('selectRefreshableVideoGeneration ignores child regeneration tasks', () => {
  const selected = selectRefreshableVideoGeneration([
    { id: 20, status: 'processing', taskId: 'child-task', defectCheckParentId: 19 },
    { id: 19, status: 'processing', taskId: 'root-task', defectCheckParentId: null },
  ])

  assert.equal(selected?.id, 19)
})

test('selectRefreshableVideoGeneration returns null when no provider task can be polled', () => {
  const selected = selectRefreshableVideoGeneration([
    { id: 30, status: 'processing', taskId: null, defectCheckParentId: null },
    { id: 31, status: 'completed', taskId: 'done-task', defectCheckParentId: null },
  ])

  assert.equal(selected, null)
})
