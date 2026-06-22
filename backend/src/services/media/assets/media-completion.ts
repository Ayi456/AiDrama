import {
  buildCharacterImagePatch,
  buildCharacterAssetImagePatch,
  buildSceneImagePatch,
  buildStoryboardImagePatch,
  buildStoryboardVideoPatch,
  type CharacterImagePatch,
  type CharacterAssetImagePatch,
  type SceneImagePatch,
  type StoryboardImagePatch,
  type StoryboardVideoPatch,
} from './media-publication.js'

export type UploadGeneratedAsset = (localPath: string) => Promise<string | null | undefined>

export type CompletedAssetInput = {
  publicUrl: string
  localPath: string
}

export type GeneratedImageSource =
  | { type: 'url'; imageUrl: string }
  | { type: 'base64'; data: string; mimeType: string }

export type GeneratedVideoSource = { type: 'url'; videoUrl: string }

export type MaterializeGeneratedImageDeps = {
  downloadFile: (url: string, folder: string) => Promise<string>
  saveBase64Image: (data: string, mimeType: string, folder: string) => Promise<string>
}

export type MaterializeGeneratedVideoDeps = {
  downloadFile: (url: string, folder: string) => Promise<string>
}

export type MaterializedGeneratedImage =
  | { kind: 'downloaded'; localPath: string }
  | { kind: 'saved-base64'; localPath: string; mimeType: string }

export type MaterializedGeneratedVideo = { kind: 'downloaded'; localPath: string }

export type ImageCompletionInput = CompletedAssetInput & {
  updatedAt: string
}

export type VideoCompletionInput = CompletedAssetInput & {
  completedAt: string
}

export type ImageCompletionOwnerRecord = {
  storyboardId?: number | null
  characterId?: number | null
  characterAssetId?: number | null
  sceneId?: number | null
  frameType?: string | null
}

export type CompleteGeneratedImageJobInput = {
  id: number
  provider: string
  source: GeneratedImageSource
}

export type CompleteGeneratedVideoJobInput = {
  id: number
  source: GeneratedVideoSource
  duration?: number | null
  storyboardId?: number | null
}

export type CompletedGeneratedJobResult = CompletedAssetInput & {
  action?: 'publish' | 'regenerate' | 'failed' | 'billing_required'
}

export type ImageCompletionPatch = ReturnType<typeof buildImageCompletionPatch>
export type VideoCompletionPatch = ReturnType<typeof buildVideoCompletionPatch>

export type CompleteGeneratedImageJobDeps = MaterializeGeneratedImageDeps & {
  now: () => string
  uploadGeneratedAsset: UploadGeneratedAsset
  loadOwnerRecord: (id: number) => Promise<ImageCompletionOwnerRecord | null>
  persistImageCompletion: (patch: ImageCompletionPatch) => Promise<void>
  publishStoryboardImage: (storyboardId: number, patch: StoryboardImagePatch) => Promise<void>
  publishCharacterImage: (characterId: number, patch: CharacterImagePatch) => Promise<void>
  publishCharacterAssetImage: (characterAssetId: number, patch: CharacterAssetImagePatch) => Promise<void>
  publishSceneImage: (sceneId: number, patch: SceneImagePatch) => Promise<void>
  logSuccess: (taskName: string, event: string, payload: Record<string, unknown>) => void
}

export type DefectCheckCallback = (input: {
  id: number
  publicUrl: string
  localPath: string
  duration: number | null | undefined
  storyboardId: number | null | undefined
}) => Promise<{ action: 'publish' | 'regenerate' | 'failed' }>

export type VideoSettlementInput = {
  id: number
  publicUrl: string
  localPath: string
  duration: number | null | undefined
  storyboardId: number | null | undefined
}

export type VideoSettlementResult =
  | { status: 'settled' }
  | { status: 'billing_required'; message: string }

export type PendingVideoSettlementPatch = {
  pendingVideoUrl: string
  pendingLocalPath: string
  pendingDurationSeconds: string
  billingStatus: 'billing_required'
  billingError: string
  status: 'billing_required'
  updatedAt: string
}

export type CompleteGeneratedVideoJobDeps = MaterializeGeneratedVideoDeps & {
  now: () => string
  uploadGeneratedAsset: UploadGeneratedAsset
  readVideoDuration?: (localPath: string) => Promise<number>
  persistVideoCompletion: (patch: VideoCompletionPatch) => Promise<void>
  persistPendingVideoSettlement?: (patch: PendingVideoSettlementPatch) => Promise<void>
  publishStoryboardVideo: (storyboardId: number, patch: StoryboardVideoPatch) => Promise<void>
  logSuccess: (taskName: string, event: string, payload: Record<string, unknown>) => void
  defectCheck?: DefectCheckCallback
  settleVideoCompletion?: (input: VideoSettlementInput) => Promise<VideoSettlementResult>
}

export async function publishGeneratedAsset(localPath: string, upload: UploadGeneratedAsset) {
  return await upload(localPath) || localPath
}

export async function materializeGeneratedImage(
  source: GeneratedImageSource,
  deps: MaterializeGeneratedImageDeps,
): Promise<MaterializedGeneratedImage> {
  if (source.type === 'url') {
    return {
      kind: 'downloaded',
      localPath: await deps.downloadFile(source.imageUrl, 'images'),
    }
  }

  return {
    kind: 'saved-base64',
    localPath: await deps.saveBase64Image(source.data, source.mimeType, 'images'),
    mimeType: source.mimeType,
  }
}

export async function materializeGeneratedVideo(
  source: GeneratedVideoSource,
  deps: MaterializeGeneratedVideoDeps,
): Promise<MaterializedGeneratedVideo> {
  return {
    kind: 'downloaded',
    localPath: await deps.downloadFile(source.videoUrl, 'videos'),
  }
}

export function buildImageCompletionPatch(input: ImageCompletionInput) {
  return {
    imageUrl: input.publicUrl,
    localPath: input.localPath,
    minioUrl: input.publicUrl,
    status: 'completed' as const,
    updatedAt: input.updatedAt,
  }
}

export function buildVideoCompletionPatch(input: VideoCompletionInput) {
  return {
    videoUrl: input.publicUrl,
    localPath: input.localPath,
    minioUrl: input.publicUrl,
    status: 'completed' as const,
    completedAt: input.completedAt,
    updatedAt: input.completedAt,
  }
}

export async function completeGeneratedImageJob(
  input: CompleteGeneratedImageJobInput,
  deps: CompleteGeneratedImageJobDeps,
): Promise<CompletedGeneratedJobResult> {
  const materialized = await materializeGeneratedImage(input.source, deps)
  const localPath = materialized.localPath
  const publicUrl = await publishGeneratedAsset(localPath, deps.uploadGeneratedAsset)
  const ownerRecord = await deps.loadOwnerRecord(input.id)

  await deps.persistImageCompletion(buildImageCompletionPatch({
    publicUrl,
    localPath,
    updatedAt: deps.now(),
  }))

  if (materialized.kind === 'saved-base64') {
    deps.logSuccess('ImageTask', 'saved-base64', {
      id: input.id,
      provider: input.provider,
      mimeType: materialized.mimeType,
      localPath,
      publicUrl,
    })
  } else {
    deps.logSuccess('ImageTask', 'downloaded', {
      id: input.id,
      provider: input.provider,
      localPath,
      publicUrl,
    })
  }

  if (ownerRecord?.storyboardId) {
    await deps.publishStoryboardImage(
      ownerRecord.storyboardId,
      buildStoryboardImagePatch(ownerRecord.frameType, publicUrl, deps.now()),
    )
  }
  if (ownerRecord?.characterId) {
    await deps.publishCharacterImage(
      ownerRecord.characterId,
      buildCharacterImagePatch(publicUrl, localPath, deps.now()),
    )
  }
  if (ownerRecord?.characterAssetId) {
    await deps.publishCharacterAssetImage(
      ownerRecord.characterAssetId,
      buildCharacterAssetImagePatch(publicUrl, localPath, deps.now()),
    )
  }
  if (ownerRecord?.sceneId) {
    await deps.publishSceneImage(
      ownerRecord.sceneId,
      buildSceneImagePatch(publicUrl, localPath, deps.now()),
    )
  }

  return { publicUrl, localPath }
}

export async function completeGeneratedVideoJob(
  input: CompleteGeneratedVideoJobInput,
  deps: CompleteGeneratedVideoJobDeps,
): Promise<CompletedGeneratedJobResult> {
  const materialized = await materializeGeneratedVideo(input.source, deps)
  const localPath = materialized.localPath
  const publicUrl = await publishGeneratedAsset(localPath, deps.uploadGeneratedAsset)
  const measuredDuration = deps.readVideoDuration ? await deps.readVideoDuration(localPath) : 0
  const completionDuration = measuredDuration > 0 ? measuredDuration : input.duration

  if (deps.settleVideoCompletion) {
    const settlement = await deps.settleVideoCompletion({
      id: input.id,
      publicUrl,
      localPath,
      duration: completionDuration,
      storyboardId: input.storyboardId,
    })
    if (settlement.status === 'billing_required') {
      await deps.persistPendingVideoSettlement?.({
        pendingVideoUrl: publicUrl,
        pendingLocalPath: localPath,
        pendingDurationSeconds: Number(completionDuration || 0).toFixed(2),
        billingStatus: 'billing_required',
        billingError: settlement.message,
        status: 'billing_required',
        updatedAt: deps.now(),
      })
      return { action: 'billing_required', publicUrl, localPath }
    }
  }

  if (deps.defectCheck) {
    const decision = await deps.defectCheck({
      id: input.id,
      publicUrl,
      localPath,
      duration: completionDuration,
      storyboardId: input.storyboardId,
    })
    if (decision.action === 'regenerate' || decision.action === 'failed') {
      return { action: decision.action, publicUrl, localPath }
    }
  }

  await deps.persistVideoCompletion(buildVideoCompletionPatch({
    publicUrl,
    localPath,
    completedAt: deps.now(),
  }))
  deps.logSuccess('VideoTask', 'downloaded', {
    id: input.id,
    localPath,
    publicUrl,
    storyboardId: input.storyboardId,
    duration: completionDuration,
  })

  if (input.storyboardId) {
    await deps.publishStoryboardVideo(
      input.storyboardId,
      buildStoryboardVideoPatch(publicUrl, completionDuration, deps.now()),
    )
  }

  return { action: 'publish', publicUrl, localPath }
}
