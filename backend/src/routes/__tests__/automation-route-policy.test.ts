import test from 'node:test'
import assert from 'node:assert/strict'
import { computeDerivedProgress, normalizePatchAction, resolveProgress } from '../policies/automation-route-policy.js'

test('computeDerivedProgress for extract stage returns 0/1', () => {
  const p = computeDerivedProgress({ stage: 'extract', counts: { storyboards: 0 } })
  assert.deepEqual(p, { current: 0, total: 1, label: '提取角色与分镜' })
})

test('computeDerivedProgress for video returns done/total', () => {
  const p = computeDerivedProgress({ stage: 'video', counts: { storyboards: 12, videos: 5 } })
  assert.deepEqual(p, { current: 5, total: 12, label: '生成镜头视频' })
})

test('resolveProgress prefers a live snapshot for the active automation stage', () => {
  const p = resolveProgress(
    { stage: 'extract', counts: { storyboards: 0 } },
    { stage: 'extract', current: 2, total: 5, label: '拆解分镜' },
  )
  assert.deepEqual(p, { current: 2, total: 5, label: '拆解分镜' })
})

test('resolveProgress ignores stale live snapshots from another stage', () => {
  const p = resolveProgress(
    { stage: 'video', counts: { storyboards: 12, videos: 5 } },
    { stage: 'extract', current: 2, total: 5, label: '拆解分镜' },
  )
  assert.deepEqual(p, { current: 5, total: 12, label: '生成镜头视频' })
})

test('normalizePatchAction maps known actions', () => {
  assert.equal(normalizePatchAction('cancel'), 'cancel')
  assert.equal(normalizePatchAction('resume'), 'resume')
  assert.equal(normalizePatchAction('abort'), 'abort')
  assert.equal(normalizePatchAction('xxx'), null)
})
