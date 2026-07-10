export type GridPromptStoryboard = {
  id: number
  storyboardNumber: number
  sceneId?: number | null
  imagePrompt?: string | null
  description?: string | null
  title?: string | null
  action?: string | null
  movement?: string | null
  location?: string | null
  shotType?: string | null
}

export type GridReferenceAsset = {
  path: string
  label: string
  kind: 'scene' | 'character' | 'storyboard'
  sceneId?: number
  characterId?: number
  storyboardId?: number
  imageIndex?: number
  imageLabel?: string
}

export type GridCellPrompt = {
  shot_number: number
  frame_type: string
  prompt: string
}

export type GridPayload = {
  grid_prompt: string
  cell_prompts: GridCellPrompt[]
}

function positionLabel(index: number, cols: number) {
  const row = Math.floor(index / cols)
  const col = index % cols
  return `row ${row + 1} col ${col + 1}`
}

function cellLabel(index: number, cols: number) {
  return `格${index + 1}（${positionLabel(index, cols)}）`
}

export function parseGridJsonArray(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && Boolean(item))
      : []
  } catch {
    return []
  }
}

export function buildReferenceLegend(referenceAssets: GridReferenceAsset[]) {
  if (!referenceAssets.length) return ''
  return referenceAssets.map((asset) => `${asset.imageLabel}=${asset.label}`).join('；')
}

function buildStoryboardReferenceHints(
  storyboard: GridPromptStoryboard,
  referenceAssets: GridReferenceAsset[],
  storyboardCharacterIds: Map<number, number[]>,
) {
  const hints: string[] = []
  const characterIds = storyboardCharacterIds.get(storyboard.id) || []

  for (const asset of referenceAssets) {
    if (
      asset.kind === 'scene'
      && storyboard.sceneId
      && asset.sceneId === storyboard.sceneId
    ) {
      hints.push(`${asset.imageLabel}（${asset.label}）`)
    }
    if (
      asset.kind === 'character'
      && asset.characterId
      && characterIds.includes(asset.characterId)
    ) {
      hints.push(`${asset.imageLabel}（${asset.label}）`)
    }
    if (asset.kind === 'storyboard' && asset.storyboardId === storyboard.id) {
      hints.push(`${asset.imageLabel}（${asset.label}）`)
    }
  }

  return [...new Set(hints)].slice(0, 4)
}

const MULTI_REFERENCE_ANGLES = [
  'wide establishing shot', 'medium shot character focus',
  'close-up detail', 'dramatic low angle', 'over-the-shoulder view',
  'bird eye view', 'side profile', 'atmospheric detail',
  'extreme close-up', 'dutch angle', 'silhouette shot',
  'depth of field focus', 'symmetrical composition', 'leading lines',
  'negative space', 'high angle looking down', 'ground level',
  'panoramic wide', 'intimate two-shot', 'reflection shot',
  'shadow play', 'backlit silhouette', 'macro detail',
  'split lighting', 'rim light portrait',
]

export function buildGridPrompt(
  mode: string,
  storyboards: GridPromptStoryboard[],
  rows: number,
  cols: number,
  dramaStyle: string,
  referenceAssets: GridReferenceAsset[],
  storyboardCharacterIds: Map<number, number[]>,
): string {
  const style = dramaStyle || 'cinematic'
  const legend = buildReferenceLegend(referenceAssets)

  if (mode === 'first_frame') {
    const cells = storyboards.map((storyboard, index) => {
      const desc = storyboard.imagePrompt
        || storyboard.description
        || storyboard.title
        || `shot ${index + 1}`
      const refs = buildStoryboardReferenceHints(
        storyboard,
        referenceAssets,
        storyboardCharacterIds,
      )
      return `${cellLabel(index, cols)}: ${refs.length ? `参考${refs.join('、')}，` : ''}${desc}`
    })
    return [
      `${rows}x${cols} grid layout, consistent art style, ${style},`,
      legend ? `参考图映射：${legend}` : '',
      '当画面涉及角色或场景时，优先使用对应的图片编号来约束一致性。',
      ...cells,
      'high quality, cinematic lighting, no text, no watermark',
    ].filter(Boolean).join('\n')
  }

  if (mode === 'first_last') {
    const totalCells = rows * cols
    const cells = Array.from({ length: totalCells }, (_, index) => {
      const storyboard = storyboards[index % storyboards.length]
      const desc = storyboard.imagePrompt
        || storyboard.description
        || storyboard.title
        || `shot ${index + 1}`
      const action = storyboard.action || storyboard.movement || ''
      const refs = buildStoryboardReferenceHints(
        storyboard,
        referenceAssets,
        storyboardCharacterIds,
      )
      const frameHint = index % 2 === 0
        ? 'opening moment'
        : `${action ? `${action}, ` : ''}closing moment, subtle motion change`
      return `${cellLabel(index, cols)}: ${refs.length ? `参考${refs.join('、')}，` : ''}${desc}, ${frameHint}`
    })
    return [
      `${rows}x${cols} grid layout, consistent art style, ${style},`,
      legend ? `参考图映射：${legend}` : '',
      'first/last frame visual rhythm, alternating opening and closing beats across the grid,',
      ...cells,
      'continuous motion implied between left and right, high quality, no text',
    ].filter(Boolean).join('\n')
  }

  if (mode === 'multi_ref') {
    const storyboard = storyboards[0]
    const desc = storyboard.imagePrompt || storyboard.description || storyboard.title || 'scene'
    const totalCells = rows * cols
    const cells = Array.from({ length: totalCells }, (_, index) =>
      `${cellLabel(index, cols)}: ${legend ? `参考${legend}，` : ''}${desc}, ${MULTI_REFERENCE_ANGLES[index % MULTI_REFERENCE_ANGLES.length]}`,
    )
    return [
      `${rows}x${cols} grid layout, same scene different angles and compositions, ${style},`,
      legend ? `参考图映射：${legend}` : '',
      `main scene: ${desc},`,
      ...cells,
      'consistent lighting and color palette, high quality, no text',
    ].filter(Boolean).join('\n')
  }

  return `${rows}x${cols} grid, ${style}, storyboard frames, high quality`
}

export function buildGridCellPrompts(
  mode: string,
  storyboards: GridPromptStoryboard[],
  rows: number,
  cols: number,
  referenceAssets: GridReferenceAsset[],
  storyboardCharacterIds: Map<number, number[]>,
): GridCellPrompt[] {
  if (!storyboards.length) return []

  if (mode === 'multi_ref') {
    const storyboard = storyboards[0]
    const desc = storyboard.imagePrompt || storyboard.description || storyboard.title || 'scene'
    const refs = buildStoryboardReferenceHints(
      storyboard,
      referenceAssets,
      storyboardCharacterIds,
    )
    return Array.from({ length: rows * cols }, (_, index) => ({
      shot_number: storyboard.storyboardNumber,
      frame_type: 'reference',
      prompt: `${cellLabel(index, cols)}: ${refs.join('、')}${refs.length ? '，' : ''}${desc}, ${MULTI_REFERENCE_ANGLES[index % MULTI_REFERENCE_ANGLES.length]}`,
    }))
  }

  if (mode === 'first_last') {
    return Array.from({ length: rows * cols }, (_, index) => {
      const storyboard = storyboards[index % storyboards.length]
      const desc = storyboard.imagePrompt
        || storyboard.description
        || storyboard.title
        || `shot ${storyboard.storyboardNumber || ''}`
      const motion = storyboard.action || storyboard.movement || ''
      const refs = buildStoryboardReferenceHints(
        storyboard,
        referenceAssets,
        storyboardCharacterIds,
      )
      const isFirst = index % 2 === 0
      return {
        shot_number: storyboard.storyboardNumber,
        frame_type: isFirst ? 'first_frame' : 'last_frame',
        prompt: isFirst
          ? `${cellLabel(index, cols)}，首帧：${refs.length ? `参考${refs.join('、')}，` : ''}${desc}${storyboard.location ? `, ${storyboard.location}` : ''}${storyboard.shotType ? `, ${storyboard.shotType}` : ''}`
          : `${cellLabel(index, cols)}，尾帧：${refs.length ? `参考${refs.join('、')}，` : ''}${desc}${motion ? `, ${motion}` : ''}${storyboard.location ? `, ${storyboard.location}` : ''}${storyboard.shotType ? `, ${storyboard.shotType}` : ''}`,
      }
    })
  }

  return storyboards.slice(0, rows * cols).map((storyboard, index) => {
    const desc = storyboard.imagePrompt
      || storyboard.description
      || storyboard.title
      || `shot ${storyboard.storyboardNumber || ''}`
    const refs = buildStoryboardReferenceHints(
      storyboard,
      referenceAssets,
      storyboardCharacterIds,
    )
    return {
      shot_number: storyboard.storyboardNumber,
      frame_type: 'first_frame',
      prompt: `${cellLabel(index, cols)}：${refs.length ? `参考${refs.join('、')}，` : ''}${desc}${storyboard.location ? `, ${storyboard.location}` : ''}${storyboard.shotType ? `, ${storyboard.shotType}` : ''}, opening scene`,
    }
  })
}

function extractJsonCandidate(text: string) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const plain = text.match(/\{[\s\S]*\}/)
  return plain?.[0]?.trim() || ''
}

function normalizeGridPayload(payload: unknown): GridPayload | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  const gridPrompt = typeof record.grid_prompt === 'string'
    ? record.grid_prompt.trim()
    : typeof record.gridPrompt === 'string'
      ? record.gridPrompt.trim()
      : ''
  const rawCells = Array.isArray(record.cell_prompts)
    ? record.cell_prompts
    : Array.isArray(record.cellPrompts)
      ? record.cellPrompts
      : []
  const cellPrompts = rawCells
    .filter((cell): cell is Record<string, unknown> =>
      Boolean(cell) && typeof cell === 'object' && !Array.isArray(cell),
    )
    .map((cell) => ({
      shot_number: Number(cell.shot_number ?? cell.shotNumber ?? 0) || 0,
      frame_type: String(cell.frame_type ?? cell.frameType ?? 'first_frame'),
      prompt: String(cell.prompt ?? '').trim(),
    }))
    .filter((cell) => cell.prompt)

  if (!gridPrompt) return null
  return { grid_prompt: gridPrompt, cell_prompts: cellPrompts }
}

export function findGridPayload(value: unknown): GridPayload | null {
  if (!value) return null

  const normalized = normalizeGridPayload(value)
  if (normalized) return normalized

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed || trimmed === 'null') return null
    try {
      return findGridPayload(JSON.parse(trimmed))
    } catch {
      const candidate = extractJsonCandidate(trimmed)
      if (!candidate) return null
      try {
        return findGridPayload(JSON.parse(candidate))
      } catch {
        return null
      }
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGridPayload(item)
      if (found) return found
    }
    return null
  }

  if (typeof value === 'object') {
    for (const nested of Object.values(value)) {
      const found = findGridPayload(nested)
      if (found) return found
    }
  }

  return null
}
