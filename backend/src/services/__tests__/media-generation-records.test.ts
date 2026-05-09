import assert from 'node:assert/strict'

import {
  buildImageGenerationRequestContext,
  buildVideoGenerationRequestContext,
  loadMediaGenerationRecord,
} from '../media/generation/media-generation-records.js'

function runTest(name: string, fn: () => void | Promise<void>) {
  Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`PASS ${name}`)
    })
    .catch((error) => {
      console.error(`FAIL ${name}`)
      throw error
    })
}

runTest('loadMediaGenerationRecord returns the first record for a media job id', async () => {
  const requestedIds: number[] = []
  const loaded = await loadMediaGenerationRecord(42, async (id) => {
    requestedIds.push(id)
    return [
      { id: 42, prompt: 'first' },
      { id: 43, prompt: 'ignored' },
    ]
  })

  assert.deepEqual(requestedIds, [42])
  assert.deepEqual(loaded, {
    type: 'found',
    record: { id: 42, prompt: 'first' },
  })
})

runTest('loadMediaGenerationRecord reports missing records without throwing', async () => {
  const loaded = await loadMediaGenerationRecord(99, async () => [])

  assert.deepEqual(loaded, {
    type: 'missing',
    id: 99,
  })
})

runTest('buildImageGenerationRequestContext exposes image owner and frame context', () => {
  assert.deepEqual(
    buildImageGenerationRequestContext({
      id: 7,
      provider: 'volcengine',
      record: {
        storyboardId: 11,
        sceneId: 12,
        characterId: 13,
        frameType: 'first_frame',
      },
    }),
    {
      id: 7,
      provider: 'volcengine',
      storyboardId: 11,
      sceneId: 12,
      characterId: 13,
      frameType: 'first_frame',
    },
  )
})

runTest('buildVideoGenerationRequestContext exposes video storyboard and reference mode', () => {
  assert.deepEqual(
    buildVideoGenerationRequestContext({
      id: 8,
      provider: 'seedance',
      record: {
        storyboardId: 21,
        referenceMode: 'first_last_frame',
      },
    }),
    {
      id: 8,
      provider: 'seedance',
      storyboardId: 21,
      referenceMode: 'first_last_frame',
    },
  )
})
