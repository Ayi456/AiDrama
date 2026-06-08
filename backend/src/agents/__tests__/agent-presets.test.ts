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

runTest('extractor preset defines scene prompts as reusable environment assets', () => {
  const instructions = AIDRAMA_AGENT_PRESETS.extractor.instructions

  assert.match(instructions, /角色提取与描述生成规则/)
  assert.match(instructions, /限定词\+姓名/)
  assert.match(instructions, /年龄段 → 性别特征 → 身高体型/)
  assert.match(instructions, /不超过3个标签或20字/)
  assert.match(instructions, /输出目标为角色视觉设定/)
  assert.match(instructions, /scene\.prompt 是可复用的场景资产提示词/)
  assert.match(instructions, /错误示例/)
  assert.match(instructions, /正确示例/)
  assert.match(instructions, /不要把当前剧情摘要写进 scene\.prompt/)
})

runTest('storyboard preset keeps scene asset prompt separate from shot prompts', () => {
  const instructions = AIDRAMA_AGENT_PRESETS.storyboard_breaker.instructions

  assert.match(instructions, /scene\.prompt 是纯环境资产/)
  assert.match(instructions, /人物动作、对白和剧情变化只能写入/)
  assert.match(instructions, /不要改写或扩展场景资产 prompt/)
})
