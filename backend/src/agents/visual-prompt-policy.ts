export const VISUAL_GRID_MODES = ['first_frame', 'first_last', 'multi_ref'] as const

export type VisualGridMode = typeof VISUAL_GRID_MODES[number]

export type VisualPromptShot = {
  shot_number: number
  description: string
  shot_type?: string
  dialogue?: string
  location?: string
  time?: string
}

export type VisualPromptCell = {
  shot_number: number
  frame_type: 'first_frame' | 'last_frame' | 'reference'
  prompt: string
}

export type VisualGridPromptPlan = {
  grid_prompt: string
  cell_prompts: VisualPromptCell[]
}

type CharacterPromptSource = {
  name?: string | null
  appearance?: string | null
  description?: string | null
  role?: string | null
  personality?: string | null
  style?: string | null
}

type ScenePromptSource = {
  location?: string | null
  time?: string | null
  prompt?: string | null
  style?: string | null
}

type VisualGridPromptInput = {
  shots: VisualPromptShot[]
  rows: number
  cols: number
  mode: string
  referenceLegend?: string
}

function compactPromptParts(parts: Array<string | null | undefined>) {
  return parts
    .map(part => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ')
}

function getStyleText(style?: string | null) {
  const normalized = style?.trim()
  return normalized || ''
}

const visualDescriptionKeywords = [
  '岁', '年龄', '少年', '青年', '中年', '老年',
  '外貌', '面容', '脸', '眉', '眼', '黑眼圈', '五官', '肤', '发', '长发', '短发', '下巴',
  '身形', '身材', '体型', '清瘦', '挺拔', '高大', '瘦削',
  '穿', '着', '服', '衣', '袍', '裙', '甲', '装', '配饰',
  '神情', '表情', '气质', '姿态', '脚步', '疲惫', '镇定', '沉稳', '冷峻', '温和',
  '女孩', '女生', '少女', '女性', '女子', '姑娘', '女修', '女主', '女孩子',
  '男孩', '男生', '男性', '男子', '男人', '男修', '男主', '男孩子',
  'young', 'old', 'face', 'hair', 'eyes', 'skin', 'body', 'wearing', 'clothes',
  'expression', 'temperament', 'tired', 'calm',
]

const nonVisualDescriptionCues: Array<string | RegExp> = [
  '穿越者', '系统', '权限', '秩序之眼', '神秘能力', '触发', '关键时刻',
  '疑惑', '运气', '失控', '关系', '尊敬', '不确定', '板上钉钉', '嘴上功夫', '兜里',
  /第[一二三四五六七八九十百千万0-9]+集/, '本集', '剧情', '出席', '百宗宴', '上宾席', '商会', '会长',
  '赠送', '获得', '秘境', '通行', '玉牌',
  'system', 'ability', 'episode', 'receives', 'token', 'plot',
]

function splitDescriptionClauses(description: string) {
  return description
    .split(/[。！？!?；;，,\n]/)
    .map(clause => clause.trim())
    .filter(Boolean)
}

function hasNonVisualCue(clause: string) {
  return nonVisualDescriptionCues.some(cue => typeof cue === 'string' ? clause.includes(cue) : cue.test(clause))
}

function isVisualDescriptionClause(clause: string) {
  const hasVisualCue = visualDescriptionKeywords.some(keyword => clause.includes(keyword))
  if (!hasVisualCue) return false
  return !hasNonVisualCue(clause)
}

function extractVisualCharacterDescription(description?: string | null) {
  const normalized = description?.trim()
  if (!normalized) return ''
  return splitDescriptionClauses(normalized)
    .filter(isVisualDescriptionClause)
    .join('，')
}

function cleanIdentityDescription(description?: string | null) {
  const normalized = description?.trim()
  if (!normalized) return ''
  return splitDescriptionClauses(normalized)
    .filter(clause => !hasNonVisualCue(clause))
    .join('，')
}

type GenderCue = {
  zh: string
  en: string
}

function extractGenderCue(...sources: Array<string | null | undefined>): GenderCue | null {
  const text = sources.map(source => source?.trim()).filter(Boolean).join(' ')
  if (!text) return null

  const femalePatterns = [/女孩/, /女生/, /少女/, /女性/, /女子/, /姑娘/, /女修/, /女主/, /女孩子/]
  const malePatterns = [/男孩/, /男生/, /男性/, /男子/, /男人/, /男修/, /男主/, /男孩子/]

  if (femalePatterns.some(pattern => pattern.test(text))) {
    return { zh: '女性角色', en: 'female character' }
  }

  if (malePatterns.some(pattern => pattern.test(text))) {
    return { zh: '男性角色', en: 'male character' }
  }

  return null
}

export function normalizeVisualGridMode(mode: string): VisualGridMode {
  return VISUAL_GRID_MODES.includes(mode as VisualGridMode)
    ? mode as VisualGridMode
    : 'first_frame'
}

export function buildCharacterImagePrompt(source: CharacterPromptSource) {
  const appearance = extractVisualCharacterDescription(source.appearance)
  const personality = extractVisualCharacterDescription(source.personality)
  const role = cleanIdentityDescription(source.role)
  const genderCue = extractGenderCue(source.role, source.appearance, source.description, source.personality)
  const style = getStyleText(source.style)
  const descriptionFallback = appearance
    ? ''
    : extractVisualCharacterDescription(source.description)

  return compactPromptParts([
    source.name,
    genderCue ? `${genderCue.zh}, ${genderCue.en}` : null,
    appearance,
    descriptionFallback,
    personality ? `personality: ${personality}` : null,
    role ? `role: ${role}` : null,
    style ? `project style: ${style}` : null,
    'cinematic portrait',
    'high quality',
    'consistent art style',
    'no text',
    'no watermark',
  ])
}

export function buildCharacterPortraitGenerationPrompt(source: CharacterPromptSource) {
  const appearance = extractVisualCharacterDescription(source.appearance)
  const personality = extractVisualCharacterDescription(source.personality)
  const role = cleanIdentityDescription(source.role)
  const genderCue = extractGenderCue(source.role, source.appearance, source.description, source.personality)
  const style = getStyleText(source.style)
  const descriptionFallback = appearance
    ? ''
    : extractVisualCharacterDescription(source.description)

  return compactPromptParts([
    source.name,
    genderCue ? `${genderCue.zh} ${genderCue.en}` : null,
    appearance,
    descriptionFallback,
    personality,
    role ? `身份：${role}` : null,
    style ? `项目风格： ${style}` : null,
    '高清质感',
    '三张并排的全身角色设定图，统一纯白背景',
    '画面内只保留人物本身，不要任何文字、标签、标题、编号、水印，不要给每张图添加视图名称',
    '统一风格、统一构图、统一角色识别',
  ])
}

export function buildSceneImagePrompt(source: ScenePromptSource) {
  const style = getStyleText(source.style)
  return compactPromptParts([
    source.location,
    source.time,
    source.prompt,
    style ? `项目风格： ${style}` : null,
    '电影感场景',
    '氛围光影',
    '高质量',
    '统一画风',
    '无文字',
    '无水印',
  ])
}

function describeShotForPrompt(shot: VisualPromptShot) {
  return compactPromptParts([
    shot.description,
    shot.location,
    shot.time,
    shot.shot_type,
    shot.dialogue ? `dialogue cue: ${shot.dialogue}` : null,
  ])
}

function buildReferencePrefix(referenceLegend?: string) {
  const normalized = referenceLegend?.trim()
  return normalized ? `reference map: ${normalized}, ` : ''
}

function buildGridOverview(
  rows: number,
  cols: number,
  shots: VisualPromptShot[],
  referenceLegend?: string,
) {
  const totalCells = rows * cols
  const shotSummary = shots.map(describeShotForPrompt).join(' | ')
  return compactPromptParts([
    `${rows}x${cols} grid layout`,
    `exactly ${totalCells} visible panels`,
    'consistent art style',
    'cinematic quality',
    buildReferencePrefix(referenceLegend) + shotSummary,
    'no merged panels',
    'no missing panels',
    'no text',
    'no watermark',
  ])
}

export function buildVisualGridPromptPlan(input: VisualGridPromptInput): VisualGridPromptPlan {
  const mode = normalizeVisualGridMode(input.mode)
  const totalCells = input.rows * input.cols
  const referencePrefix = buildReferencePrefix(input.referenceLegend)
  const gridPrompt = buildGridOverview(input.rows, input.cols, input.shots, input.referenceLegend)

  if (mode === 'multi_ref') {
    const shot = input.shots[0]
    return {
      grid_prompt: gridPrompt,
      cell_prompts: Array.from({ length: totalCells }, (_, index) => ({
        shot_number: shot.shot_number,
        frame_type: 'reference',
        prompt: compactPromptParts([
          `Panel ${index + 1}`,
          referencePrefix + describeShotForPrompt(shot),
          'alternate reference angle',
          'cinematic lighting',
          `consistent with the ${input.rows}x${input.cols} grid`,
        ]),
      })),
    }
  }

  if (mode === 'first_last') {
    return {
      grid_prompt: gridPrompt,
      cell_prompts: Array.from({ length: totalCells }, (_, index) => {
        const shot = input.shots[index % input.shots.length]
        const isFirstFrame = index % 2 === 0
        return {
          shot_number: shot.shot_number,
          frame_type: isFirstFrame ? 'first_frame' : 'last_frame',
          prompt: compactPromptParts([
            `Panel ${index + 1}`,
            referencePrefix + describeShotForPrompt(shot),
            isFirstFrame ? 'opening frame' : 'ending frame',
            isFirstFrame ? 'establish the action' : 'show continuous motion result',
          ]),
        }
      }),
    }
  }

  return {
    grid_prompt: gridPrompt,
    cell_prompts: Array.from({ length: totalCells }, (_, index) => {
      const shot = input.shots[index % input.shots.length]
      return {
        shot_number: shot.shot_number,
        frame_type: 'first_frame',
        prompt: compactPromptParts([
          `Panel ${index + 1}`,
          referencePrefix + describeShotForPrompt(shot),
          'opening frame',
          'cinematic composition',
        ]),
      }
    }),
  }
}
