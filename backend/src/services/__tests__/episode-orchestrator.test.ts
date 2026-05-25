import test from 'node:test'
import assert from 'node:assert/strict'
import { computeAdvanceDecision } from '../automation/episode-orchestrator.js'

test('idle episode + start returns transition to running/extract', () => {
  const decision = computeAdvanceDecision({
    status: 'idle', stage: 'extract', attempt: 0, isComplete: false, maxRetries: 2,
  })
  assert.deepEqual(decision, { type: 'noop', reason: 'not-running' })
})

test('running stage not complete → noop (wait for hook)', () => {
  const decision = computeAdvanceDecision({
    status: 'running', stage: 'extract', attempt: 0, isComplete: false, maxRetries: 2,
  })
  assert.deepEqual(decision, { type: 'noop', reason: 'wait-for-completion' })
})

test('running stage complete → transition to next stage', () => {
  const decision = computeAdvanceDecision({
    status: 'running', stage: 'extract', attempt: 0, isComplete: true, maxRetries: 2,
  })
  assert.equal(decision.type, 'transition')
  if (decision.type === 'transition') assert.equal(decision.toStage, 'character_image')
})

test('running merge complete → done status', () => {
  const decision = computeAdvanceDecision({
    status: 'running', stage: 'merge', attempt: 0, isComplete: true, maxRetries: 2,
  })
  assert.deepEqual(decision, { type: 'finish' })
})

test('failed run with attempt < max → retry same stage', () => {
  const decision = computeAdvanceDecision({
    status: 'running', stage: 'shot_image', attempt: 0, isComplete: false, maxRetries: 2, lastError: 'timeout',
  })
  assert.equal(decision.type, 'retry')
})

test('failed run with attempt >= max → mark failed', () => {
  const decision = computeAdvanceDecision({
    status: 'running', stage: 'shot_image', attempt: 2, isComplete: false, maxRetries: 2, lastError: 'timeout',
  })
  assert.equal(decision.type, 'fail')
})
