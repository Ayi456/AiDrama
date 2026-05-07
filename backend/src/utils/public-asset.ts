type AssetRecord = Record<string, unknown>

function readFirst(row: AssetRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function setAlias(row: AssetRecord, camelKey: string, snakeKey: string, value: string) {
  row[camelKey] = value
  row[snakeKey] = value
}

export function presentImageGenerationAsset<T extends AssetRecord>(row: T): T & AssetRecord {
  const result: AssetRecord = { ...row }
  const imageUrl = readFirst(result, ['imageUrl', 'image_url'])
  const minioUrl = readFirst(result, ['minioUrl', 'minio_url'])
  const providerImageUrl = readFirst(result, ['providerImageUrl', 'provider_image_url'])
    || (minioUrl && imageUrl && imageUrl !== minioUrl ? imageUrl : '')
  const publicUrl = minioUrl || imageUrl

  if (providerImageUrl) setAlias(result, 'providerImageUrl', 'provider_image_url', providerImageUrl)
  if (publicUrl) {
    setAlias(result, 'imageUrl', 'image_url', publicUrl)
    setAlias(result, 'publicUrl', 'public_url', publicUrl)
  }
  if (minioUrl) setAlias(result, 'localPath', 'local_path', minioUrl)

  return result as T & AssetRecord
}

export function presentImageGenerationAssets<T extends AssetRecord>(rows: T[]) {
  return rows.map(row => presentImageGenerationAsset(row))
}

export function presentVideoGenerationAsset<T extends AssetRecord>(row: T): T & AssetRecord {
  const result: AssetRecord = { ...row }
  const videoUrl = readFirst(result, ['videoUrl', 'video_url'])
  const minioUrl = readFirst(result, ['minioUrl', 'minio_url'])
  const providerVideoUrl = readFirst(result, ['providerVideoUrl', 'provider_video_url'])
    || (minioUrl && videoUrl && videoUrl !== minioUrl ? videoUrl : '')
  const publicUrl = minioUrl || videoUrl

  if (providerVideoUrl) setAlias(result, 'providerVideoUrl', 'provider_video_url', providerVideoUrl)
  if (publicUrl) {
    setAlias(result, 'videoUrl', 'video_url', publicUrl)
    setAlias(result, 'publicUrl', 'public_url', publicUrl)
  }
  if (minioUrl) setAlias(result, 'localPath', 'local_path', minioUrl)

  return result as T & AssetRecord
}

export function presentVideoGenerationAssets<T extends AssetRecord>(rows: T[]) {
  return rows.map(row => presentVideoGenerationAsset(row))
}
