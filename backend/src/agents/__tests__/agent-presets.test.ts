import assert from 'node:assert/strict'

import {
  AIDRAMA_AGENT_PRESETS,
  AIDRAMA_AGENT_TYPES,
  getAgentPreset,
  isValidAgentType,
  validAgentTypes,
} from '../presets.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('agent preset registry exposes stable AiDrama agent types', () => {
  assert.deepEqual(validAgentTypes, [
    'script_rewriter',
    'extractor',
    'storyboard_breaker',
    'grid_prompt_generator',
  ])
  assert.deepEqual(AIDRAMA_AGENT_TYPES, validAgentTypes)
  assert.deepEqual(Object.keys(AIDRAMA_AGENT_PRESETS), validAgentTypes)
})

runTest('agent presets use readable AiDrama-owned defaults', () => {
  const mojibakeFragments = [
    '\u9345',
    '\u748b',
    '\u642e',
    '\u9225',
    '\u4fd9',
    '\ufffd',
  ]

  for (const type of validAgentTypes) {
    const preset = AIDRAMA_AGENT_PRESETS[type]

    assert.match(preset.name, /^AiDrama /)
    assert.match(preset.instructions, /AiDrama/)
    for (const fragment of mojibakeFragments) {
      assert.equal(preset.instructions.includes(fragment), false)
    }
    assert.ok(preset.instructions.length > 200)
  }
})

runTest('agent preset helpers validate and resolve known types only', () => {
  assert.equal(isValidAgentType('script_rewriter'), true)
  assert.equal(isValidAgentType('unknown_agent'), false)

  assert.equal(getAgentPreset('storyboard_breaker')?.name, 'AiDrama Shot Planner')
  assert.equal(getAgentPreset('unknown_agent'), null)
})
