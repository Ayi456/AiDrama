export type LoadedMediaGenerationRecord<T> =
  | { type: 'found'; record: T }
  | { type: 'missing'; id: number }

export type ImageGenerationRequestContextRecord = {
  storyboardId?: number | null
  sceneId?: number | null
  characterId?: number | null
  frameType?: string | null
}

export type VideoGenerationRequestContextRecord = {
  storyboardId?: number | null
  referenceMode?: string | null
}

export type VideoGenerationPollingContextRecord = {
  storyboardId?: number | null
  duration?: number | null
}

export async function loadMediaGenerationRecord<T>(
  id: number,
  fetchRows: (id: number) => Promise<readonly T[]>,
): Promise<LoadedMediaGenerationRecord<T>> {
  const rows = await fetchRows(id)
  const record = rows[0]
  return record ? { type: 'found', record } : { type: 'missing', id }
}

export function buildImageGenerationRequestContext(input: {
  id: number
  provider: string
  record: ImageGenerationRequestContextRecord
}) {
  return {
    id: input.id,
    provider: input.provider,
    storyboardId: input.record.storyboardId,
    sceneId: input.record.sceneId,
    characterId: input.record.characterId,
    frameType: input.record.frameType,
  }
}

export function buildVideoGenerationRequestContext(input: {
  id: number
  provider: string
  record: VideoGenerationRequestContextRecord
}) {
  return {
    id: input.id,
    provider: input.provider,
    storyboardId: input.record.storyboardId,
    referenceMode: input.record.referenceMode,
  }
}

export function buildVideoGenerationPollingContext(record: VideoGenerationPollingContextRecord) {
  return {
    storyboardId: record.storyboardId,
    duration: record.duration,
  }
}
