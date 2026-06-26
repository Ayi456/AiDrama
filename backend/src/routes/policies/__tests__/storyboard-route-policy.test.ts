import assert from 'node:assert/strict'

import {
  appendDialogueToVideoPrompt,
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
    videoPrompt: '对白/旁白：We are late.',
    sceneId: 9,
    duration: 10,
    createdAt: '2026-05-08T00:00:00.000Z',
    updatedAt: '2026-05-08T00:00:00.000Z',
  })
})

runTest('storyboard duration is clamped to video model limits', () => {
  const values = buildStoryboardCreateValues(
    {
      episode_id: 42,
      storyboard_number: 1,
      title: 'Long shot',
      duration: 16,
    },
    '2026-05-08T00:00:00.000Z',
  )
  assert.equal(values.duration, 15)

  const patch = buildStoryboardUpdatePatch(
    {
      duration: 16,
    },
    '2026-05-08T00:01:00.000Z',
  )
  assert.equal(patch.duration, 15)
})

runTest('buildStoryboardUpdatePatch maps supported fields and ignores route-only keys', () => {
  const patch = buildStoryboardUpdatePatch(
    {
      title: 'New title',
      shot_type: 'close_up',
      video_prompt: 'slow push in',
      video_url: 'https://cdn.example.com/history.mp4',
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
    videoUrl: 'https://cdn.example.com/history.mp4',
  })
})

runTest('appendDialogueToVideoPrompt adds dialogue and narration to saved video prompts', () => {
  const prompt = appendDialogueToVideoPrompt(
    '前 3 秒推近山门，后 3 秒切到顾玄回头。',
    '旁白：山门钟声骤响。\n顾玄：别慌，先看阵眼。',
  )

  assert.match(prompt, /前 3 秒推近山门/)
  assert.match(prompt, /对白\/旁白：旁白：山门钟声骤响。/)
  assert.match(prompt, /顾玄：别慌，先看阵眼。/)
})

runTest('buildStoryboardUpdatePatch stores video prompt with dialogue when both are provided', () => {
  const patch = buildStoryboardUpdatePatch(
    {
      video_prompt: '镜头缓慢推进到主角脸部。',
      dialogue: '旁白：风声压过人群。',
    },
    '2026-05-08T00:01:00.000Z',
  )

  assert.deepEqual(patch, {
    updatedAt: '2026-05-08T00:01:00.000Z',
    dialogue: '旁白：风声压过人群。',
    videoPrompt: '镜头缓慢推进到主角脸部。\n对白/旁白：旁白：风声压过人群。',
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
