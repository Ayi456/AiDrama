export type CharacterAssetBindingRecord = {
  characterAssetId?: number | null
}

export type CharacterAssetReferenceRecord = {
  id: number
  imageUrl?: string | null
  referenceImage?: string | null
  localPath?: string | null
  isActive?: boolean | number | null
  deletedAt?: string | null
}

export function resolveCharacterAssetReferenceImages(
  character: CharacterAssetBindingRecord,
  asset: CharacterAssetReferenceRecord | null | undefined,
) {
  if (!character.characterAssetId || !asset) return []
  if (asset.deletedAt) return []
  if (asset.isActive === false || asset.isActive === 0) return []
  const image = asset.referenceImage || asset.imageUrl || asset.localPath
  return image ? [image] : []
}
