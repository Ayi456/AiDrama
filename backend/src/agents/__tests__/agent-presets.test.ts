import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  AIDRAMA_AGENT_PRESETS,
  AIDRAMA_AGENT_TYPES,
  getAgentPreset,
  isValidAgentType,
  validAgentTypes,
} from '../presets.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const extractToolsSource = fs.readFileSync(path.resolve(__dirname, '../tools/extract-tools.js'), 'utf8')

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

runTest('extractor preset folds complete character styling into extraction rules', () => {
  const instructions = AIDRAMA_AGENT_PRESETS.extractor.instructions

  assert.match(instructions, /完整定装/)
  assert.match(instructions, /保守补全/)
  assert.match(instructions, /脸型/)
  assert.match(instructions, /上身服装/)
  assert.match(instructions, /下身服装/)
  assert.match(instructions, /禁止凭空编造姓名/)
  assert.match(instructions, /第一人称“我”/)
  assert.match(instructions, /复合角色/)
  assert.match(instructions, /普通背景动物、植物、物件/)
  assert.match(instructions, /40岁属于中年/)
  assert.match(extractToolsSource, /保守补全/)
  assert.doesNotMatch(extractToolsSource, /Do not invent unstated traits/)
})

runTest('extractor preset keeps character assets as stable baseline appearances', () => {
  const instructions = AIDRAMA_AGENT_PRESETS.extractor.instructions

  assert.match(instructions, /通用基准设定/)
  assert.match(instructions, /稳定外观/)
  assert.match(instructions, /单场景表情/)
  assert.match(instructions, /临时疲态/)
  assert.match(instructions, /临时动作姿态/)
  assert.match(instructions, /临时服装凌乱/)
  assert.match(instructions, /剧情阶段变化/)
  assert.match(instructions, /长期稳定特征/)
  assert.match(instructions, /具体镜头的 image_prompt \/ video_prompt/)
  assert.match(instructions, /不能把单次熬夜、哭泣、受伤、愤怒造成的外观写成角色基准/)
  assert.match(extractToolsSource, /通用基准设定/)
  assert.match(extractToolsSource, /临时疲态/)
  assert.match(extractToolsSource, /剧情阶段变化/)
})

runTest('storyboard preset keeps scene asset prompt separate from shot prompts', () => {
  const instructions = AIDRAMA_AGENT_PRESETS.storyboard_breaker.instructions

  assert.match(instructions, /scene\.prompt 是纯环境资产/)
  assert.match(instructions, /人物动作、对白和剧情变化只能写入/)
  assert.match(instructions, /不要改写或扩展场景资产 prompt/)
})

runTest('storyboard preset folds genre trigger points without forcing over-splitting', () => {
  const instructions = AIDRAMA_AGENT_PRESETS.storyboard_breaker.instructions

  assert.match(instructions, /题材节奏补充规则/)
  assert.match(instructions, /主要题材倾向/)
  assert.match(instructions, /题材触发点只提高新开镜头权重/)
  assert.match(instructions, /不代表必须逐句拆分/)
  assert.match(instructions, /关键线索、身份揭露、反转、行动决策、情绪爆发或题材核心爽点/)
  assert.match(instructions, /都市：职场对峙/)
  assert.match(instructions, /女频：告白/)
  assert.match(instructions, /古风：意境画面/)
  assert.match(instructions, /异能：觉醒/)
  assert.match(instructions, /悬疑：诡异发现/)
  assert.match(instructions, /穿越：初穿反应/)
})

runTest('storyboard preset enforces reveal pacing, continuity, and dialogue fields', () => {
  const instructions = AIDRAMA_AGENT_PRESETS.storyboard_breaker.instructions

  assert.match(instructions, /线索出现 → 真相揭示 → 人物消化\/崩溃 → 新决定\/和解/)
  assert.match(instructions, /关键揭示类内容要给观众留出理解空间/)
  assert.match(instructions, /action 超过 4 个连续动作阶段/)
  assert.match(instructions, /前后镜头的物理状态不能矛盾/)
  assert.match(instructions, /门开\/关/)
  assert.match(instructions, /result 必须写清本镜头结束时的可接续状态/)
  assert.match(instructions, /电话声、广播声或旁白/)
  assert.match(instructions, /不能只藏在 action、description 或 video_prompt 里/)
})
