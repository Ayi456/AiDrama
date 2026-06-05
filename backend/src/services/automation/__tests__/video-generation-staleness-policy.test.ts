import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getVideoGenerationInFlightState,
  STALE_VIDEO_GENERATION_NO_TASK_MS,
  STALE_VIDEO_GENERATION_WITH_TASK_MS,
} from '../video-generation-staleness-policy.js'

const now = Date.parse('2026-06-01T12:00:00.000Z')

test('recent pending root video generation remains in flight', () => {
  const state = getVideoGenerationInFlightState({
    status: 'pending',
    taskId: null,
    updatedAt: new Date(now - 5 * 60 * 1000).toISOString(),
    createdAt: new Date(now - 5 * 60 * 1000).toISOString(),
    defectCheckParentId: null,
  }, now)

  assert.deepEqual(state, { inFlight: true, stale: false, reason: null })
})

test('defect-checking video generation remains in flight', () => {
  const state = getVideoGenerationInFlightState({
    status: 'checking_defect',
    taskId: 'cgt-123',
    updatedAt: new Date(now - 5 * 60 * 1000).toISOString(),
    createdAt: new Date(now - 5 * 60 * 1000).toISOString(),
    defectCheckParentId: null,
  }, now)

  assert.deepEqual(state, { inFlight: true, stale: false, reason: null })
})

test('old processing root video generation without task id is stale', () => {
  const state = getVideoGenerationInFlightState({
    status: 'processing',
    taskId: null,
    updatedAt: new Date(now - STALE_VIDEO_GENERATION_NO_TASK_MS - 1).toISOString(),
    createdAt: new Date(now - STALE_VIDEO_GENERATION_NO_TASK_MS - 1).toISOString(),
    defectCheckParentId: null,
  }, now)

  assert.equal(state.inFlight, false)
  assert.equal(state.stale, true)
  assert.match(state.reason ?? '', /missing provider task id/i)
})

test('old processing root video generation with task id uses longer stale window', () => {
  const recentEnough = getVideoGenerationInFlightState({
    status: 'processing',
    taskId: 'cgt-123',
    updatedAt: new Date(now - STALE_VIDEO_GENERATION_NO_TASK_MS - 1).toISOString(),
    createdAt: new Date(now - STALE_VIDEO_GENERATION_NO_TASK_MS - 1).toISOString(),
    defectCheckParentId: null,
  }, now)

  assert.deepEqual(recentEnough, { inFlight: true, stale: false, reason: null })

  const tooOld = getVideoGenerationInFlightState({
    status: 'processing',
    taskId: 'cgt-123',
    updatedAt: new Date(now - STALE_VIDEO_GENERATION_WITH_TASK_MS - 1).toISOString(),
    createdAt: new Date(now - STALE_VIDEO_GENERATION_WITH_TASK_MS - 1).toISOString(),
    defectCheckParentId: null,
  }, now)

  assert.equal(tooOld.inFlight, false)
  assert.equal(tooOld.stale, true)
  assert.match(tooOld.reason ?? '', /timed out/i)
})

test('child regeneration rows block duplicate root generation while in flight', () => {
  const state = getVideoGenerationInFlightState({
    status: 'processing',
    taskId: null,
    updatedAt: new Date(now - 5 * 60 * 1000).toISOString(),
    createdAt: new Date(now - 5 * 60 * 1000).toISOString(),
    defectCheckParentId: 10,
  }, now)

  assert.deepEqual(state, { inFlight: true, stale: false, reason: null })
})
