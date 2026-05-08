import assert from 'node:assert/strict'

import {
  buildStoryboardCreateLogContext,
  buildStoryboardCreateValues,
  buildStoryboardUpdatePatch,
  resolveStoryboardBindingInput,
} from '../storyboard-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('buildStoryboardCreateValues maps create bodies and preserves legacy defaults', () => {
  const values = buildStoryboardCreateValues(
    {
      episode_id: 42,
      storyboard_number: 0,
      title: 'Opening shot',
      description: 'Wide hall',
      action: 'Hero enters',
      dialogue: 'We are late.',
      scene_id: 9,
      duration: 0,
      character_ids: [2, 3],
      ignored: 'not persisted',
    },
    '2026-05-08T00:00:00.000Z',
  )

  assert.deepEqual(values, {
    episodeId: 42,
    storyboardNumber: 1,
    title: 'Opening shot',
    description: 'Wide hall',
    action: 'Hero enters',
    dialogue: 'We are late.',
    sceneId: 9,
    duration: 10,
    createdAt: '2026-05-08T00:00:00.000Z',
    updatedAt: '2026-05-08T00:00:00.000Z',
  })
})

runTest('buildStoryboardUpdatePatch maps supported fields and ignores route-only keys', () => {
  const patch = buildStoryboardUpdatePatch(
    {
      title: 'New title',
      shot_type: 'close_up',
      video_prompt: 'slow push in',
      character_ids: [7, 8],
      unknown_field: 'ignored',
    },
    '2026-05-08T00:01:00.000Z',
  )

  assert.deepEqual(patch, {
    updatedAt: '2026-05-08T00:01:00.000Z',
    title: 'New title',
    shotType: 'close_up',
    videoPrompt: 'slow push in',
  })
})

runTest('resolveStoryboardBindingInput preserves existing bindings unless keys are present', () => {
  const preserved = resolveStoryboardBindingInput(
    {},
    { sceneId: 5 },
    [1, 2],
  )
  assert.deepEqual(preserved, { sceneId: 5, characterIds: [1, 2] })

  const replaced = resolveStoryboardBindingInput(
    { scene_id: null, character_ids: [3] },
    { sceneId: 5 },
    [1, 2],
  )
  assert.deepEqual(replaced, { sceneId: null, characterIds: [3] })
})

runTest('buildStoryboardCreateLogContext exposes route-owned log fields', () => {
  const context = buildStoryboardCreateLogContext({
    episode_id: 42,
    scene_id: 9,
    character_ids: [2, 3],
  })

  assert.deepEqual(context, {
    episodeId: 42,
    shotNumber: 1,
    sceneId: 9,
    characterIds: [2, 3],
  })
})
