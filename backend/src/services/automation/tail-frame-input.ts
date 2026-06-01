import fs from 'fs'
import crypto from 'crypto'
import path from 'path'

import {
  buildCosObjectUrl,
  createCosRequestAuthorization,
  getCosConfig,
  staticAssetToLocalPath,
  staticAssetToCosObjectKey,
} from '../../utils/cos.js'
import { resolveTailFrameInputPath } from './tail-frame-path-policy.js'

export type TailFrameInputSource = {
  localPath?: string | null
  videoUrl?: string | null
  minioUrl?: string | null
}

export type TailFrameInputDownload = {
  sourceUrl: string
  localPath: string
}

export type TailFrameInputDeps = {
  exists?: (filePath: string) => boolean
  download?: (input: TailFrameInputDownload) => Promise<boolean>
}

function isRemoteUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

function nonEmpty(value: string | null | undefined) {
  const normalized = String(value || '').trim()
  return normalized || null
}

function firstRemoteUrl(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = nonEmpty(value)
    if (normalized && isRemoteUrl(normalized)) return normalized
  }
  return null
}

function resolveDownloadUrl(source: TailFrameInputSource) {
  const remote = firstRemoteUrl(source.minioUrl, source.videoUrl, source.localPath)
  if (remote) return remote

  const localAsset = nonEmpty(source.localPath)
  const config = getCosConfig()
  if (!localAsset || !config) return null

  const objectKey = staticAssetToCosObjectKey(localAsset)
  if (!objectKey || isRemoteUrl(objectKey)) return null
  return buildCosObjectUrl(objectKey, config)
}

function remoteTailFrameCachePath(source: TailFrameInputSource, storageRoot: string) {
  const remote = firstRemoteUrl(source.minioUrl, source.videoUrl, source.localPath)
  if (!remote) return null

  let ext = '.mp4'
  try {
    const parsedExt = path.extname(new URL(remote).pathname).toLowerCase()
    if (['.mp4', '.mov', '.webm'].includes(parsedExt)) ext = parsedExt
  } catch {}

  const digest = crypto.createHash('sha1').update(remote).digest('hex').slice(0, 16)
  return path.join(storageRoot, 'videos', 'tail-frame-sources', `${digest}${ext}`)
}

function resolveLocalInputPath(source: TailFrameInputSource, dataRoot: string, storageRoot: string) {
  const localPath = resolveTailFrameInputPath(source.localPath, dataRoot, storageRoot)
  if (localPath) return localPath

  for (const candidate of [source.minioUrl, source.videoUrl, source.localPath]) {
    const raw = nonEmpty(candidate)
    if (!raw) continue

    const resolved = staticAssetToLocalPath(raw, dataRoot, storageRoot)
    if (resolved && !isRemoteUrl(resolved)) return resolved
  }

  return remoteTailFrameCachePath(source, storageRoot)
}

export async function downloadTailFrameInputFile(input: TailFrameInputDownload) {
  if (!input.localPath || isRemoteUrl(input.localPath)) return false
  if (!input.sourceUrl || !isRemoteUrl(input.sourceUrl)) return false

  fs.mkdirSync(path.dirname(input.localPath), { recursive: true })

  const headers: Record<string, string> = {
    'User-Agent': 'AiDramaTailFrame/1.0',
  }
  const authorization = createCosRequestAuthorization('GET', input.sourceUrl)
  if (authorization) headers.Authorization = authorization

  const response = await fetch(input.sourceUrl, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Download failed ${response.status}: ${body.slice(0, 500)}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length === 0) throw new Error('Downloaded file is empty')
  fs.writeFileSync(input.localPath, buffer)
  return true
}

export async function ensureTailFrameInputFile(
  input: {
    source: TailFrameInputSource
    dataRoot: string
    storageRoot: string
  },
  deps: TailFrameInputDeps = {},
) {
  const localPath = resolveLocalInputPath(input.source, input.dataRoot, input.storageRoot)
  if (!localPath) return null

  const exists = deps.exists || fs.existsSync
  if (exists(localPath)) return localPath

  const sourceUrl = resolveDownloadUrl(input.source)
  if (!sourceUrl) return null

  const download = deps.download || downloadTailFrameInputFile
  try {
    await download({ sourceUrl, localPath })
  } catch (error) {
    throw new Error(`Failed to restore tail-frame source video: ${sourceUrl} -> ${localPath}: ${(error as Error).message}`)
  }

  if (!exists(localPath)) {
    throw new Error(`Tail-frame source video is still missing after restore: ${sourceUrl} -> ${localPath}`)
  }

  return localPath
}
