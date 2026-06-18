import assert from 'node:assert/strict'

import {
  getPendingVideoHistoryGeneration,
  getVideoHistoryUrl,
  normalizeVideoHistory,
  shouldApplyVideoHistoryLoadResult,
} from '../chapterVideoHistoryPolicy.ts'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('video history resolves supported video URL fields', () => {
  assert.equal(getVideoHistoryUrl({ video_url: 'a.mp4' }), 'a.mp4')
  assert.equal(getVideoHistoryUrl({ videoUrl: 'b.mp4' }), 'b.mp4')
  assert.equal(getVideoHistoryUrl({ minio_url: 'c.mp4' }), 'c.mp4')
  assert.equal(getVideoHistoryUrl({ minioUrl: 'd.mp4' }), 'd.mp4')
  assert.equal(getVideoHistoryUrl({}), '')
})

runTest('video history keeps playable rows newest first', () => {
  const rows = normalizeVideoHistory([
    { id: 2, video_url: 'older.mp4', created_at: '2026-05-12T10:00:00.000Z' },
    { id: 3, video_url: '', created_at: '2026-05-14T10:00:00.000Z' },
    { id: 4, minio_url: 'newer.mp4', created_at: '2026-05-13T10:00:00.000Z' },
    { id: 5, videoUrl: 'latest.mp4', createdAt: '2026-05-14T10:00:00.000Z' },
  ])

  assert.deepEqual(rows.map(row => getVideoHistoryUrl(row)), [
    'latest.mp4',
    'newer.mp4',
    'older.mp4',
  ])
})

runTest('video history falls back to id order and limits row count', () => {
  const rows = normalizeVideoHistory(
    Array.from({ length: 30 }, (_, index) => ({
      id: index + 1,
      video_url: `video-${index + 1}.mp4`,
    })),
  )

  assert.equal(rows.length, 24)
  assert.equal(rows[0]?.id, 30)
  assert.equal(rows.at(-1)?.id, 7)
})

runTest('video history ignores stale responses for the same storyboard', () => {
  const latestTokens = { 654: 2 }

  assert.equal(shouldApplyVideoHistoryLoadResult(latestTokens, 654, 1), false)
  assert.equal(shouldApplyVideoHistoryLoadResult(latestTokens, 654, 2), true)
})

runTest('video history detects in-flight regeneration rows for state restore', () => {
  assert.deepEqual(
    getPendingVideoHistoryGeneration([
      { id: 8, status: 'completed', video_url: 'old.mp4', created_at: '2026-06-17T08:00:00.000Z' },
      {
        id: 9,
        status: 'failed_defect',
        effective_status: 'processing',
        regeneration_id: 10,
        billing_status: 'unbilled',
        created_at: '2026-06-17T08:01:00.000Z',
      },
    ]),
    {
      generationId: 10,
      status: 'processing',
      billingStatus: 'unbilled',
    },
  )
})

runTest('video history ignores settled and billing-required rows for pending generation restore', () => {
  assert.equal(
    getPendingVideoHistoryGeneration([
      { id: 11, status: 'billing_required', billing_status: 'billing_required', created_at: '2026-06-17T08:02:00.000Z' },
      { id: 12, status: 'completed', billing_status: 'settled', created_at: '2026-06-17T08:03:00.000Z' },
    ]),
    null,
  )
})

runTest('video history does not restore older in-flight rows when a newer video is complete', () => {
  assert.equal(
    getPendingVideoHistoryGeneration([
      { id: 13, status: 'processing', billing_status: 'unbilled', created_at: '2026-06-17T08:02:00.000Z' },
      { id: 14, status: 'completed', billing_status: 'settled', video_url: 'new.mp4', created_at: '2026-06-17T08:03:00.000Z' },
    ]),
    null,
  )
})
