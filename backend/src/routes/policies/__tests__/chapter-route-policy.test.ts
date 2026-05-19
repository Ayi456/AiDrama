import assert from 'node:assert/strict'

import { buildChapterCreateValues } from '../chapter-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('buildChapterCreateValues uses chapter naming for default titles', () => {
  const values = buildChapterCreateValues(
    {
      drama_id: '8',
      title: undefined,
      image_config_id: '2',
      video_config_id: '3',
    },
    6,
    '2026-05-08T00:00:00.000Z',
    2,
    3,
  )

  assert.deepEqual(values, {
    dramaId: 8,
    episodeNumber: 6,
    title: 'Chapter 6',
    imageConfigId: 2,
    videoConfigId: 3,
    createdAt: '2026-05-08T00:00:00.000Z',
    updatedAt: '2026-05-08T00:00:00.000Z',
  })
})
