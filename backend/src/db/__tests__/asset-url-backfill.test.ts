import assert from 'node:assert/strict'

import { buildAssetUrlBackfillSteps } from '../asset-url-backfill.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('asset URL backfill persists COS URLs into generation and owner fields', () => {
  const names = buildAssetUrlBackfillSteps('2026-04-29T00:00:00.000Z').map(step => step.name)

  assert.deepEqual(names, [
    'image_generations.image_url',
    'video_generations.video_url',
    'characters.image_url',
    'scenes.image_url',
    'storyboards.first_frame_image',
    'storyboards.last_frame_image',
    'storyboards.composed_image',
    'storyboards.video_url',
  ])
})

runTest('asset URL backfill only uses completed rows with minio_url', () => {
  const sql = buildAssetUrlBackfillSteps('2026-04-29T00:00:00.000Z')
    .map(step => step.sql)
    .join('\n')

  assert.match(sql, /status = 'completed'/)
  assert.match(sql, /minio_url IS NOT NULL/)
  assert.match(sql, /minio_url <> ''/)
})
