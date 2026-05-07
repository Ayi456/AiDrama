export type UploadGeneratedAsset = (localPath: string) => Promise<string | null | undefined>

export type CompletedAssetInput = {
  publicUrl: string
  localPath: string
}

export type ImageCompletionInput = CompletedAssetInput & {
  updatedAt: string
}

export type VideoCompletionInput = CompletedAssetInput & {
  completedAt: string
}

export async function publishGeneratedAsset(localPath: string, upload: UploadGeneratedAsset) {
  return await upload(localPath) || localPath
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
