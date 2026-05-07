import assert from 'node:assert/strict'

import {
  buildCharacterImagePrompt,
  buildSceneImagePrompt,
  buildVisualGridPromptPlan,
  normalizeVisualGridMode,
} from '../visual-prompt-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('buildCharacterImagePrompt composes reusable portrait guidance', () => {
  const prompt = buildCharacterImagePrompt({
    appearance: 'silver hair, black coat',
    description: 'calm strategist',
    role: 'lead',
    personality: '',
  })

  assert.match(prompt, /silver hair/)
  assert.match(prompt, /role: lead/)
  assert.match(prompt, /cinematic portrait/)
  assert.match(prompt, /no watermark/)
  assert.doesNotMatch(prompt, /,,/)
})

runTest('buildSceneImagePrompt composes location atmosphere guidance', () => {
  const prompt = buildSceneImagePrompt({
    location: 'rainy rooftop',
    time: 'night',
    prompt: 'cold blue neon',
  })

  assert.match(prompt, /rainy rooftop/)
  assert.match(prompt, /atmospheric lighting/)
  assert.match(prompt, /consistent art style/)
})

runTest('normalizeVisualGridMode falls back to first_frame for unknown values', () => {
  assert.equal(normalizeVisualGridMode('first_last'), 'first_last')
  assert.equal(normalizeVisualGridMode('bad_mode'), 'first_frame')
})

runTest('buildVisualGridPromptPlan creates exact panel count and alternating first-last cells', () => {
  const plan = buildVisualGridPromptPlan({
    rows: 2,
    cols: 2,
    mode: 'first_last',
    referenceLegend: 'image 1 = heroine, image 2 = rooftop',
    shots: [
      {
        shot_number: 7,
        description: 'heroine steps into rain',
        location: 'rooftop',
        shot_type: 'medium shot',
      },
      {
        shot_number: 8,
        description: 'villain watches from shadow',
      },
    ],
  })

  assert.match(plan.grid_prompt, /exactly 4 visible panels/)
  assert.match(plan.grid_prompt, /no merged panels/)
  assert.match(plan.grid_prompt, /reference map: image 1 = heroine/)
  assert.equal(plan.cell_prompts.length, 4)
  assert.deepEqual(
    plan.cell_prompts.map(cell => cell.frame_type),
    ['first_frame', 'last_frame', 'first_frame', 'last_frame'],
  )
  assert.match(plan.cell_prompts[0].prompt, /Panel 1/)
})

runTest('buildVisualGridPromptPlan reuses the first shot for multi-reference grids', () => {
  const plan = buildVisualGridPromptPlan({
    rows: 1,
    cols: 3,
    mode: 'multi_ref',
    shots: [
      { shot_number: 3, description: 'detective opens the archive' },
      { shot_number: 4, description: 'assistant waits outside' },
    ],
  })

  assert.equal(plan.cell_prompts.length, 3)
  assert.deepEqual(plan.cell_prompts.map(cell => cell.shot_number), [3, 3, 3])
  assert.deepEqual(plan.cell_prompts.map(cell => cell.frame_type), ['reference', 'reference', 'reference'])
})
