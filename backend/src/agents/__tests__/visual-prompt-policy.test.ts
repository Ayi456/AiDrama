import assert from 'node:assert/strict'

import {
  buildCharacterImagePrompt,
  buildCharacterPortraitGenerationPrompt,
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
    name: '顾玄',
    appearance: 'silver hair, black coat',
    description: 'owns a mysterious system and receives a secret jade token in episode five',
    role: 'lead',
    personality: 'calm strategist',
    style: 'cinematic',
  } as any)

  assert.match(prompt, /顾玄/)
  assert.match(prompt, /silver hair/)
  assert.match(prompt, /role: lead/)
  assert.match(prompt, /calm strategist/)
  assert.match(prompt, /project style: cinematic/)
  assert.doesNotMatch(prompt, /mysterious system/)
  assert.match(prompt, /cinematic portrait/)
  assert.match(prompt, /no watermark/)
  assert.doesNotMatch(prompt, /,,/)
})

runTest('buildCharacterPortraitGenerationPrompt keeps portrait prompts visual', () => {
  const prompt = buildCharacterPortraitGenerationPrompt({
    name: '顾玄',
    role: '青云宗大师兄',
    appearance: '二十岁出头，清秀面容，明显黑眼圈，身形清瘦挺拔，青色道袍',
    description: '顾玄是青云宗大师兄，同时也是穿越者。他拥有系统和秩序之眼等神秘能力。第五集中，他出席百宗宴，最终获得商会会长赠送的秘境通行玉牌。',
    personality: '疲惫但镇定，气质克制沉稳',
    style: 'cinematic',
  } as any)

  assert.match(prompt, /顾玄/)
  assert.match(prompt, /青云宗大师兄/)
  assert.match(prompt, /黑眼圈/)
  assert.match(prompt, /青色道袍/)
  assert.match(prompt, /疲惫但镇定/)
  assert.match(prompt, /项目风格[:：]\s*电影感/)
  assert.doesNotMatch(prompt, /穿越者/)
  assert.doesNotMatch(prompt, /系统/)
  assert.doesNotMatch(prompt, /秩序之眼/)
  assert.doesNotMatch(prompt, /第五集/)
  assert.doesNotMatch(prompt, /玉牌/)
})

runTest('buildCharacterPortraitGenerationPrompt labels anime project style as 动漫', () => {
  const prompt = buildCharacterPortraitGenerationPrompt({
    name: '阿宁',
    description: '年轻女孩，黑色长发，青色修炼服，神情专注',
    style: 'anime',
  } as any)
  const legacyPrompt = buildCharacterPortraitGenerationPrompt({
    name: '阿宁',
    description: '年轻女孩，黑色长发，青色修炼服，神情专注',
    style: '二次元',
  } as any)

  assert.match(prompt, /项目风格[:：]\s*动漫/)
  assert.doesNotMatch(prompt, /二次元动漫/)
  assert.match(legacyPrompt, /项目风格[:：]\s*动漫/)
})

runTest('buildCharacterPortraitGenerationPrompt falls back to visual description clauses', () => {
  const prompt = buildCharacterPortraitGenerationPrompt({
    name: '顾玄',
    description: '顾玄约二十岁出头，外貌清秀但顶着两个黑眼圈，看起来有些疲惫。作为穿越者，他拥有系统和秩序之眼等神秘能力。最终获得商会会长赠送的秘境通行玉牌。',
    style: 'realistic',
  } as any)

  assert.match(prompt, /二十岁出头/)
  assert.match(prompt, /黑眼圈/)
  assert.match(prompt, /疲惫/)
  assert.match(prompt, /项目风格[:：]\s*写实/)
  assert.doesNotMatch(prompt, /穿越者/)
  assert.doesNotMatch(prompt, /系统/)
  assert.doesNotMatch(prompt, /玉牌/)
})

runTest('buildCharacterPortraitGenerationPrompt drops non-visual metaphors that mention body parts', () => {
  const prompt = buildCharacterPortraitGenerationPrompt({
    name: '顾玄',
    description: '约二十岁出头，外貌清秀但顶着两个黑眼圈。他最大的特点是能把不确定的事情说得像板上钉钉，嘴上功夫极强，明明兜里比脸都干净却能装出高手气度。',
    style: 'realistic',
  } as any)

  assert.match(prompt, /黑眼圈/)
  assert.doesNotMatch(prompt, /板上钉钉/)
  assert.doesNotMatch(prompt, /嘴上功夫/)
  assert.doesNotMatch(prompt, /兜里/)
})

runTest('buildCharacterPortraitGenerationPrompt filters non-visual role appearance and personality text', () => {
  const prompt = buildCharacterPortraitGenerationPrompt({
    name: '顾玄',
    role: '青云宗大师兄，穿越者，拥有系统和秩序之眼能力。',
    appearance: '约二十岁出头，清秀外貌，顶着两个黑眼圈，看起来有些疲惫。下巴微抬，神情淡漠，脚步不疾不徐，明明兜里比脸都干净却能装出高手气度。',
    personality: '疲惫但镇定，能把不确定的事说得像板上钉钉，嘴上功夫极强，内心对系统充满疑惑。',
    style: 'realistic',
  } as any)

  assert.match(prompt, /青云宗大师兄/)
  assert.match(prompt, /二十岁出头/)
  assert.match(prompt, /黑眼圈/)
  assert.match(prompt, /下巴微抬/)
  assert.match(prompt, /疲惫但镇定/)
  assert.match(prompt, /三张并排的全身角色设定图/)
  assert.match(prompt, /纯白背景/)
  assert.match(prompt, /项目风格[:：]\s*写实/)
  assert.match(prompt, /右上角/)
  assert.match(prompt, /顾玄/)
  assert.doesNotMatch(prompt, /不要给每张图添加视图名称/)
  assert.doesNotMatch(prompt, /穿越者/)
  assert.doesNotMatch(prompt, /系统/)
  assert.doesNotMatch(prompt, /秩序之眼/)
  assert.doesNotMatch(prompt, /兜里/)
  assert.doesNotMatch(prompt, /板上钉钉/)
  assert.doesNotMatch(prompt, /嘴上功夫/)
  assert.doesNotMatch(prompt, /左视图/)
  assert.doesNotMatch(prompt, /正视图/)
  assert.doesNotMatch(prompt, /右视图/)
})

runTest('buildCharacterPortraitGenerationPrompt preserves explicit female cues', () => {
  const prompt = buildCharacterPortraitGenerationPrompt({
    name: '阿宁',
    description: '对师兄充满敬佩年轻女孩，一大早就在后院打坐，努力修炼，很有干劲。',
    style: 'cinematic',
  } as any)

  assert.match(prompt, /女性角色/)
  assert.match(prompt, /female character/)
  assert.match(prompt, /年轻女孩/)
  assert.doesNotMatch(prompt, /男性角色/)
})

runTest('buildCharacterPortraitGenerationPrompt lets character prompt style override generic project style', () => {
  const prompt = buildCharacterPortraitGenerationPrompt({
    name: '会长',
    role: '龙套',
    description: [
      '青州商会会长，圆脸中年人，笑容和气，穿金戴玉，看着像个弥勒佛，眼底却精得很',
      '圆脸中年人，笑容和气，穿金戴玉',
      '精明老练，和气中藏锋芒',
      '动漫修仙风格',
      '三视图，白色背景，无文字标签',
    ].join('\n'),
    style: 'realistic',
  } as any)

  assert.match(prompt, /青州商会会长/)
  assert.match(prompt, /动漫修仙风格/)
  assert.doesNotMatch(prompt, /项目风格[:：]\s*realistic/)
  assert.doesNotMatch(prompt, /身份[:：]\s*龙套/)
  assert.doesNotMatch(prompt, /左视图/)
  assert.doesNotMatch(prompt, /右视图/)
})

runTest('buildSceneImagePrompt uses Chinese scene guidance and project style', () => {
  const prompt = buildSceneImagePrompt({
    location: '雨夜楼顶',
    time: '夜晚',
    prompt: '冷蓝霓虹',
    style: 'cinematic',
  } as any)

  assert.match(prompt, /雨夜楼顶/)
  assert.match(prompt, /夜晚/)
  assert.match(prompt, /冷蓝霓虹/)
  assert.match(prompt, /项目风格[:：]\s*电影感/)
  assert.match(prompt, /电影感场景/)
  assert.match(prompt, /统一画风/)
  assert.match(prompt, /高质量/)
  assert.match(prompt, /无文字/)
  assert.doesNotMatch(prompt, /atmospheric lighting/)
  assert.doesNotMatch(prompt, /cinematic scene/)
  assert.doesNotMatch(prompt, /high quality/)
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
