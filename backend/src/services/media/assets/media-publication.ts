export type StoryboardImagePatch = {
  updatedAt: string
  firstFrameImage?: string
  lastFrameImage?: string
  composedImage?: string
}

export type StoryboardVideoPatch = {
  updatedAt: string
  videoUrl: string
  duration?: number
}

export type CharacterImagePatch = {
  updatedAt: string
  imageUrl: string
  localPath: string
}

export type SceneImagePatch = CharacterImagePatch & {
  status: 'completed'
}

export function buildStoryboardImagePatch(
  frameType: string | null | undefined,
  publicUrl: string,
  updatedAt: string,
): StoryboardImagePatch {
  if (frameType === 'first_frame') {
    return { firstFrameImage: publicUrl, updatedAt }
  }

  if (frameType === 'last_frame') {
    return { lastFrameImage: publicUrl, updatedAt }
  }

  return { composedImage: publicUrl, updatedAt }
}

export function buildStoryboardVideoPatch(
  publicUrl: string,
  duration: number | null | undefined,
  updatedAt: string,
): StoryboardVideoPatch {
  return {
    videoUrl: publicUrl,
    duration: duration || undefined,
    updatedAt,
  }
}

export function buildCharacterImagePatch(
  publicUrl: string,
  localPath: string,
  updatedAt: string,
): CharacterImagePatch {
  return {
    imageUrl: publicUrl,
    localPath,
    updatedAt,
  }
}

export function buildSceneImagePatch(
  publicUrl: string,
  localPath: string,
  updatedAt: string,
): SceneImagePatch {
  return {
    imageUrl: publicUrl,
    localPath,
    status: 'completed',
    updatedAt,
  }
}
