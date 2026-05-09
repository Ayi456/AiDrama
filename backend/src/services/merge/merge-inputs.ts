import fs from 'fs'
import path from 'path'

import {
  buildCosObjectUrl,
  createCosRequestAuthorization,
  getCosConfig,
  staticAssetToCosObjectKey,
} from '../../utils/cos.js'

export type MergeInputFile = {
  sourceUrl: string
  localPath: string
}

type MergeInputDeps = {
  concurrency?: number
  exists?: (filePath: string) => boolean
  download?: (input: MergeInputFile) => Promise<boolean>
}

const DEFAULT_MERGE_INPUT_DOWNLOAD_CONCURRENCY = 4

function isRemoteUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

function resolveDownloadUrl(sourceUrl: string) {
  const raw = String(sourceUrl || '').trim()
  if (!raw) return null
  if (isRemoteUrl(raw)) return raw

  const config = getCosConfig()
  if (!config) return null

  const objectKey = staticAssetToCosObjectKey(raw)
  if (!objectKey || isRemoteUrl(objectKey)) return null
  return buildCosObjectUrl(objectKey, config)
}

export async function downloadMergeInputFile(input: MergeInputFile) {
  if (!input.localPath || isRemoteUrl(input.localPath)) return false

  const downloadUrl = resolveDownloadUrl(input.sourceUrl)
  if (!downloadUrl) return false

  fs.mkdirSync(path.dirname(input.localPath), { recursive: true })

  const headers: Record<string, string> = {
    'User-Agent': 'AiDramaMerge/1.0',
  }
  const authorization = createCosRequestAuthorization('GET', downloadUrl)
  if (authorization) headers.Authorization = authorization

  const response = await fetch(downloadUrl, {
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

export function requireExistingMergeInputFiles(
  inputs: MergeInputFile[],
  exists: (filePath: string) => boolean = fs.existsSync,
) {
  const missing = inputs.filter(input => !input.localPath || isRemoteUrl(input.localPath) || !exists(input.localPath))
  if (missing.length) {
    throw new Error(`Missing merge input videos: ${missing.map(input => `${input.sourceUrl} -> ${input.localPath}`).join('; ')}`)
  }

  return inputs.map(input => input.localPath)
}

function resolveDownloadConcurrency(value: number | undefined) {
  const envValue = Number(process.env.MERGE_INPUT_DOWNLOAD_CONCURRENCY)
  const raw = value ?? envValue
  return Number.isFinite(raw) && raw > 0
    ? Math.max(1, Math.floor(raw))
    : DEFAULT_MERGE_INPUT_DOWNLOAD_CONCURRENCY
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let index = 0
  let firstError: unknown = null
  const workerCount = Math.min(concurrency, items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (!firstError) {
      const item = items[index]
      index += 1
      if (!item) return

      try {
        await worker(item)
      } catch (error) {
        firstError = error
        throw error
      }
    }
  }))
}

export async function ensureMergeInputFiles(inputs: MergeInputFile[], deps: MergeInputDeps = {}) {
  const exists = deps.exists || fs.existsSync
  const download = deps.download || downloadMergeInputFile
  const concurrency = resolveDownloadConcurrency(deps.concurrency)
  const missing = inputs.filter(input => input.localPath && !isRemoteUrl(input.localPath) && !exists(input.localPath))

  await runWithConcurrency(missing, concurrency, async (input) => {
    try {
      await download(input)
    } catch (error) {
      throw new Error(`Failed to restore merge input video: ${input.sourceUrl} -> ${input.localPath}: ${(error as Error).message}`)
    }
  })

  return requireExistingMergeInputFiles(inputs, exists)
}
