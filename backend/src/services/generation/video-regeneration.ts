export interface VideoRecordForRegen {
  id: number
  prompt: string | null
  model: string | null
  configId?: number | null
  storyboardId?: number | null
  imageUrl?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  duration?: number | null
  fps?: number | null
  resolution?: string | null
  aspectRatio?: string | null
  defectCheckAttempt?: number | null
  dramaId?: number | null
  referenceMode?: string | null
  referenceImageUrls?: string | null
  referenceVideoUrls?: string | null
  referenceAudioUrls?: string | null
}

export interface RegenEnqueueParams {
  prompt: string
  model: string | null
  configId?: number | null
  storyboardId?: number | null
  imageUrl?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  duration?: number | null
  fps?: number | null
  resolution?: string | null
  aspectRatio?: string | null
  defectCheckAttempt: number
  defectCheckParentId: number
  dramaId?: number | null
  referenceMode?: string | null
  referenceImageUrls?: string[] | string | null
  referenceVideoUrls?: string[] | string | null
  referenceAudioUrls?: string[] | string | null
}

export interface RegenInput {
  originalRecord: VideoRecordForRegen
  missingActions: string[]
  enqueue: (params: RegenEnqueueParams) => Promise<number>
}

const DEFECT_HINT_BLOCK = '\n\n【本次生成硬性要求：必须完整拍到以下关键动作，不能用镜头切换、省略或结果画面替代过程】'
const LEGACY_DEFECT_HINT_BLOCK = '\n\n【上次生成存在动作链断裂，请确保以下动作被完整拍到】'

export function stripPreviousDefectHint(prompt: string): string {
  const idx = [DEFECT_HINT_BLOCK, LEGACY_DEFECT_HINT_BLOCK]
    .map((block) => prompt.indexOf(block))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? -1
  return idx < 0 ? prompt : prompt.slice(0, idx).replace(/\s+$/, '')
}

export function buildRegenPrompt(originalPrompt: string, missingActions: string[]): string {
  const base = stripPreviousDefectHint(originalPrompt)
  if (missingActions.length === 0) {
    return `${base}${DEFECT_HINT_BLOCK}\n- 必须完整拍到所有关键状态变化所需的动作过程`
  }
  const bullets = missingActions.map((a) => `- ${a}`).join('\n')
  return `${base}${DEFECT_HINT_BLOCK}\n${bullets}`
}

export async function enqueueDefectRegeneration(input: RegenInput): Promise<number> {
  const rec = input.originalRecord
  const prompt = buildRegenPrompt(rec.prompt ?? '', input.missingActions)
  const previousAttempt = typeof rec.defectCheckAttempt === 'number' ? rec.defectCheckAttempt : 0
  return await input.enqueue({
    prompt,
    model: rec.model,
    configId: rec.configId,
    storyboardId: rec.storyboardId,
    imageUrl: rec.imageUrl,
    firstFrameUrl: rec.firstFrameUrl,
    lastFrameUrl: rec.lastFrameUrl,
    duration: rec.duration,
    fps: rec.fps,
    resolution: rec.resolution,
    aspectRatio: rec.aspectRatio,
    defectCheckAttempt: previousAttempt + 1,
    defectCheckParentId: rec.id,
    dramaId: rec.dramaId,
    referenceMode: rec.referenceMode,
    referenceImageUrls: rec.referenceImageUrls,
    referenceVideoUrls: rec.referenceVideoUrls,
    referenceAudioUrls: rec.referenceAudioUrls,
  })
}
