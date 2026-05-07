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
  appearance?: string | null
  description?: string | null
  role?: string | null
  personality?: string | null
}

type ScenePromptSource = {
  location?: string | null
  time?: string | null
  prompt?: string | null
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

export function normalizeVisualGridMode(mode: string): VisualGridMode {
  return VISUAL_GRID_MODES.includes(mode as VisualGridMode)
    ? mode as VisualGridMode
    : 'first_frame'
}

export function buildCharacterImagePrompt(source: CharacterPromptSource) {
  return compactPromptParts([
    source.appearance,
    source.description,
    source.role ? `role: ${source.role}` : null,
    source.personality ? `personality: ${source.personality}` : null,
    'cinematic portrait',
    'high quality',
    'consistent art style',
    'no text',
    'no watermark',
  ])
}

export function buildSceneImagePrompt(source: ScenePromptSource) {
  return compactPromptParts([
    source.location,
    source.time,
    source.prompt,
    'cinematic scene',
    'atmospheric lighting',
    'high quality',
    'consistent art style',
    'no text',
    'no watermark',
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
