import assert from 'node:assert/strict'

import {
  getVideoHistoryUrl,
  normalizeVideoHistory,
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
