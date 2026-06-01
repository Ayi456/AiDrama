export type PreviousTailFrameVideoGeneration = {
  id?: number | null
  tailFrameUrl?: string | null
  localPath?: string | null
  videoUrl?: string | null
  minioUrl?: string | null
}

export type PreviousTailFrameState = {
  url: string | null
  captureVideoGenerationId: number | null
  captureLocalPath: string | null
}

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim()
  return normalized || null
}

export function resolvePreviousTailFrameState(input: {
  storyboardLastFrameImage?: string | null
  videoGeneration?: PreviousTailFrameVideoGeneration | null
}): PreviousTailFrameState {
  const videoTailFrameUrl = nonEmpty(input.videoGeneration?.tailFrameUrl)
  if (videoTailFrameUrl) {
    return {
      url: videoTailFrameUrl,
      captureVideoGenerationId: null,
      captureLocalPath: null,
    }
  }

  const storyboardLastFrameImage = nonEmpty(input.storyboardLastFrameImage)
  if (storyboardLastFrameImage) {
    return {
      url: storyboardLastFrameImage,
      captureVideoGenerationId: null,
      captureLocalPath: null,
    }
  }

  const videoGenerationId = Number(input.videoGeneration?.id)
  const localPath = nonEmpty(input.videoGeneration?.localPath)
    || nonEmpty(input.videoGeneration?.minioUrl)
    || nonEmpty(input.videoGeneration?.videoUrl)
  if (Number.isFinite(videoGenerationId) && videoGenerationId > 0 && localPath) {
    return {
      url: null,
      captureVideoGenerationId: videoGenerationId,
      captureLocalPath: localPath,
    }
  }

  return {
    url: null,
    captureVideoGenerationId: null,
    captureLocalPath: null,
  }
}
