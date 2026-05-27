export type AutomationVideoStoryboard = {
  id: number
  sceneId?: number | null
}

export type AutomationVideoCharacter = {
  id: number
  imageUrl?: string | null
  characterAssetImageUrl?: string | null
}

export type AutomationVideoScene = {
  id: number
  imageUrl?: string | null
}

export type AutomationVideoReferenceInput = {
  storyboard: AutomationVideoStoryboard
  previousTailFrameUrl?: string | null
  requirePreviousTailFrame?: boolean
  characterIds: number[]
  characters: AutomationVideoCharacter[]
  scenes: AutomationVideoScene[]
}

export type AutomationVideoReferenceResult = {
  referenceMode: 'multimodal'
  referenceImageUrls: string[]
}

function pushUnique(target: string[], value: string | null | undefined, limit = 9) {
  const normalized = String(value || '').trim()
  if (!normalized || target.includes(normalized) || target.length >= limit) return
  target.push(normalized)
}

export function buildAutomationVideoReferences(input: AutomationVideoReferenceInput): AutomationVideoReferenceResult {
  const referenceImageUrls: string[] = []
  if (input.requirePreviousTailFrame && !String(input.previousTailFrameUrl || '').trim()) {
    throw new Error(`video stage: missing previous tail frame for storyboard ${input.storyboard.id}`)
  }
  pushUnique(referenceImageUrls, input.previousTailFrameUrl)

  const characterIds = new Set(input.characterIds.map(Number).filter(Number.isFinite))
  input.characters
    .filter(character => characterIds.has(Number(character.id)))
    .forEach(character => pushUnique(referenceImageUrls, character.imageUrl))

  const sceneId = Number(input.storyboard.sceneId)
  if (Number.isFinite(sceneId)) {
    const scene = input.scenes.find(item => Number(item.id) === sceneId)
    pushUnique(referenceImageUrls, scene?.imageUrl)
  }

  return {
    referenceMode: 'multimodal',
    referenceImageUrls,
  }
}
