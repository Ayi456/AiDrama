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

runTest('storyboard preset treats each storyboard as an atomic AI video task', () => {
  const instructions = AIDRAMA_AGENT_PRESETS.storyboard_breaker.instructions

  assert.match(instructions, /每个分镜不是剧情摘要，而是一次 AI 视频生成任务/)
  assert.match(instructions, /单镜头只允许一个连续空间、一个主要动作目标、一种镜头运动/)
  assert.match(instructions, /角色跨过门、电梯门、玻璃门/)
  assert.match(instructions, /需要观众看清的文字、来电、纸条、合同、诊断、聊天记录/)
  assert.match(instructions, /duration 优先 6-10 秒/)
})

runTest('storyboard preset requires adjacent-shot continuity anchors', () => {
  const instructions = AIDRAMA_AGENT_PRESETS.storyboard_breaker.instructions

  assert.match(instructions, /上一镜结束画面 = 下一镜起始画面的可见前因/)
  assert.match(instructions, /入点/)
  assert.match(instructions, /出点/)
  assert.match(instructions, /不允许用一句“随后”“转眼”“来到”跳过关键物理动作/)
  assert.match(instructions, /是否需要新增 1 个 3-6 秒过渡镜头/)
  assert.match(instructions, /饭盒、便利贴、手机、文件/)
})

runTest('storyboard preset requires explicit shot boundary planning and structured video prompts', () => {
  const instructions = AIDRAMA_AGENT_PRESETS.storyboard_breaker.instructions

  assert.match(instructions, /起始状态/)
  assert.match(instructions, /结束状态/)
  assert.match(instructions, /下一镜头承接点/)
  assert.match(instructions, /禁止提前完成的下一镜头动作/)
  assert.match(instructions, /不要作为 JSON 新字段输出/)
  assert.match(instructions, /起始画面/)
  assert.match(instructions, /镜头限制/)
  assert.match(instructions, /结束画面/)
  assert.match(instructions, /禁止项/)
  assert.match(instructions, /如果 action、description 与 result 冲突/)
  assert.match(instructions, /参考素材绑定/)
  assert.match(instructions, /不要假定最终素材编号/)
  assert.match(instructions, /多人物时必须逐个写清/)
  assert.match(instructions, /上一镜头截帧\/首图衔接参考/)
  assert.match(instructions, /最终生成视频时，系统会按实际上传顺序自动补充图片1、图片2、图片3等编号/)
  assert.match(instructions, /不要使用 <role>、<location> 或 <voice>/)
  assert.doesNotMatch(instructions, /使用 <location>地点<\/location>、<role>角色名<\/role>、<voice>说话人<\/voice> 标签/)
  assert.match(instructions, /镜头1/)
  assert.match(instructions, /不要写 0-3秒/)
  assert.match(instructions, /不要生成字幕、Logo、水印或 UI/)
  assert.match(instructions, /同款分身/)
  assert.doesNotMatch(instructions, /可以按 3 秒为一段/)
})

runTest('visual prompt preset follows Seedream asset prompt conventions', () => {
  const instructions = AIDRAMA_AGENT_PRESETS.grid_prompt_generator.instructions

  assert.match(instructions, /Seedream 5\.0/)
  assert.match(instructions, /人物外观参考图/)
  assert.match(instructions, /正面、侧面、背面/)
  assert.match(instructions, /不要出现角色名/)
  assert.match(instructions, /空场景资产图/)
  assert.match(instructions, /空间结构和方向保持稳定/)
  assert.match(instructions, /图一/)
  assert.match(instructions, /图二/)
})
