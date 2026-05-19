import assert from 'node:assert/strict'

import { buildDramaEpisodeValues } from '../drama-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('buildDramaEpisodeValues uses chapter naming for default episode titles', () => {
  const values = buildDramaEpisodeValues(
    11,
    4,
    undefined,
    '2026-05-08T00:00:00.000Z',
    2,
    3,
  )

  assert.deepEqual(values, {
    dramaId: 11,
    episodeNumber: 4,
    title: 'Chapter 4',
    imageConfigId: 2,
    videoConfigId: 3,
    status: 'draft',
    createdAt: '2026-05-08T00:00:00.000Z',
    updatedAt: '2026-05-08T00:00:00.000Z',
  })
})
