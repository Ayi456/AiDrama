import assert from 'node:assert/strict'

import {
  buildAssetUrlBackfillCheckQuery,
  buildAssetUrlBackfillSteps,
} from '../asset-url-backfill.js'

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

runTest('character owner backfill preserves a manual replacement with a different local path', () => {
  const characterStep = buildAssetUrlBackfillSteps('2026-04-29T00:00:00.000Z')
    .find(step => step.name === 'characters.image_url')

  assert.ok(characterStep)
  assert.match(
    characterStep.sql,
    /WHERE \(c\.image_url IS NULL OR c\.image_url = ''\)\s+OR \(c\.image_url <> latest\.minio_url\s+AND c\.local_path = latest\.local_path\)/,
  )
})

runTest('scene owner backfill preserves a manual replacement with a different local path', () => {
  const sceneStep = buildAssetUrlBackfillSteps('2026-04-29T00:00:00.000Z')
    .find(step => step.name === 'scenes.image_url')

  assert.ok(sceneStep)
  assert.match(
    sceneStep.sql,
    /WHERE \(s\.image_url IS NULL OR s\.image_url = ''\)\s+OR \(s\.image_url <> latest\.minio_url\s+AND s\.local_path = latest\.local_path\)/,
  )
})

runTest('asset URL backfill check ignores preserved manual character replacements', () => {
  assert.match(
    buildAssetUrlBackfillCheckQuery(),
    /WHERE \(c\.image_url IS NULL OR c\.image_url = ''\)\s+OR \(c\.image_url <> latest\.minio_url\s+AND c\.local_path = latest\.local_path\)/,
  )
})

runTest('asset URL backfill check ignores preserved manual scene replacements', () => {
  assert.match(
    buildAssetUrlBackfillCheckQuery(),
    /WHERE \(s\.image_url IS NULL OR s\.image_url = ''\)\s+OR \(s\.image_url <> latest\.minio_url\s+AND s\.local_path = latest\.local_path\)/,
  )
})

runTest('asset URL backfill check query reports the same targets as the update steps', () => {
  const stepNames = buildAssetUrlBackfillSteps('2026-04-29T00:00:00.000Z').map(step => step.name)
  const query = buildAssetUrlBackfillCheckQuery()

  for (const name of stepNames) {
    assert.match(query, new RegExp(`SELECT '${name.replace('.', '\\.')}' AS name, COUNT\\(\\*\\) AS remaining`))
  }
  assert.equal(query.match(/UNION ALL/g)?.length, stepNames.length - 1)
})
