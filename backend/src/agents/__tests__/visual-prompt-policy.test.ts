import assert from 'node:assert/strict'

import {
  appendProjectStyleToVideoPrompt,
  buildCharacterImagePrompt,
  buildCharacterPortraitGenerationPrompt,
  buildSceneImagePrompt,
  buildVisualGridPromptPlan,
  normalizeVisualGridMode,
  resolveSceneEnvironmentPrompt,
  sanitizeSceneEnvironmentPrompt,
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
  assert.match(prompt, /项目风格[:：]\s*cinematic/)
  assert.doesNotMatch(prompt, /穿越者/)
  assert.doesNotMatch(prompt, /系统/)
  assert.doesNotMatch(prompt, /秩序之眼/)
  assert.doesNotMatch(prompt, /第五集/)
  assert.doesNotMatch(prompt, /玉牌/)
})

runTest('buildCharacterPortraitGenerationPrompt keeps user-entered project style text', () => {
  const prompt = buildCharacterPortraitGenerationPrompt({
    name: '阿宁',
    description: '年轻女孩，黑色长发，青色修炼服，神情专注',
    style: 'anime',
  } as any)
  const customPrompt = buildCharacterPortraitGenerationPrompt({
    name: '阿宁',
    description: '年轻女孩，黑色长发，青色修炼服，神情专注',
    style: '二次元',
  } as any)

  assert.match(prompt, /项目风格[:：]\s*anime/)
  assert.doesNotMatch(prompt, /二次元动漫/)
  assert.match(customPrompt, /项目风格[:：]\s*二次元/)
  assert.doesNotMatch(customPrompt, /项目风格[:：]\s*动漫/)
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
  assert.match(prompt, /项目风格[:：]\s*realistic/)
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
  assert.match(prompt, /项目风格[:：]\s*realistic/)
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
  assert.match(prompt, /项目风格[:：]\s*cinematic/)
  assert.match(prompt, /电影感场景/)
  assert.match(prompt, /统一画风/)
  assert.match(prompt, /高质量/)
  assert.match(prompt, /无文字/)
  assert.doesNotMatch(prompt, /atmospheric lighting/)
  assert.doesNotMatch(prompt, /cinematic scene/)
  assert.doesNotMatch(prompt, /high quality/)
})

runTest('buildSceneImagePrompt keeps scene guidance focused on environment', () => {
  const sourcePrompt = '中午的云泽楼大殿，光线充足，气氛热烈。宴席开始，侍女奉上灵茶与灵果。商会会长亲自现身，圆脸中年人，笑容和气，穿金戴玉。他专门走向青云宗席位，称赞顾玄识破封图，询问陆尘天赋。陆尘因灵茶触发雷意外露，木剑表面闪过细电，引起众人关注。整体氛围既热闹又暗藏玄机。'
  const prompt = buildSceneImagePrompt({
    location: '云泽楼大殿',
    time: '中午',
    prompt: sourcePrompt,
    style: 'guofeng',
  } as any)

  assert.match(prompt, /云泽楼大殿/)
  assert.match(prompt, /光线充足/)
  assert.match(prompt, /气氛热烈/)
  assert.match(prompt, /整体氛围既热闹又暗藏玄机/)
  assert.match(prompt, /只描述环境/)
  assert.doesNotMatch(prompt, /侍女奉上/)
  assert.doesNotMatch(prompt, /商会会长/)
  assert.doesNotMatch(prompt, /顾玄/)
  assert.doesNotMatch(prompt, /陆尘/)
  assert.doesNotMatch(prompt, /木剑/)
})

runTest('sanitizeSceneEnvironmentPrompt removes character action clauses from scene text', () => {
  const prompt = sanitizeSceneEnvironmentPrompt('古风大殿，木质梁柱，暖色光线。陆尘站在席位旁，众人看向他。桌案上摆着灵茶与灵果。')

  assert.match(prompt, /古风大殿/)
  assert.match(prompt, /木质梁柱/)
  assert.match(prompt, /暖色光线/)
  assert.match(prompt, /桌案上摆着灵茶与灵果/)
  assert.doesNotMatch(prompt, /陆尘/)
  assert.doesNotMatch(prompt, /众人看向/)
})

runTest('sanitizeSceneEnvironmentPrompt keeps environment clauses from mixed scene text', () => {
  const prompt = sanitizeSceneEnvironmentPrompt('云泽楼大殿，梁柱高阔，侍女奉上灵茶与灵果。背景是热闹宴会场景，宾客们关注这边的对话。')

  assert.match(prompt, /云泽楼大殿/)
  assert.match(prompt, /梁柱高阔/)
  assert.match(prompt, /热闹宴会场景/)
  assert.doesNotMatch(prompt, /侍女/)
  assert.doesNotMatch(prompt, /宾客们/)
  assert.doesNotMatch(prompt, /对话/)
})

runTest('resolveSceneEnvironmentPrompt falls back to location when prompt has no environment text', () => {
  const prompt = resolveSceneEnvironmentPrompt('陆尘站在席位旁，众人看向他。', '云泽楼大殿')

  assert.equal(prompt, '云泽楼大殿')
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

runTest('appendProjectStyleToVideoPrompt appends a consistent style anchor', () => {
  const result = appendProjectStyleToVideoPrompt('<location>大殿</location> 镜头推进', '国风水墨')

  assert.match(result, /<location>大殿<\/location> 镜头推进/)
  assert.match(result, /项目风格：国风水墨/)
})

runTest('appendProjectStyleToVideoPrompt leaves prompt untouched when style is empty', () => {
  assert.equal(appendProjectStyleToVideoPrompt('原始提示词', ''), '原始提示词')
  assert.equal(appendProjectStyleToVideoPrompt('原始提示词', null), '原始提示词')
})

runTest('appendProjectStyleToVideoPrompt does not duplicate an already present style', () => {
  const once = appendProjectStyleToVideoPrompt('画面，项目风格：国风水墨', '国风水墨')

  assert.equal(once.match(/国风水墨/g)?.length, 1)
})
