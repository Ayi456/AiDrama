import crypto from 'crypto'
import fs from 'fs'
import https from 'https'
import path from 'path'
import { fileURLToPath } from 'url'

import { resolveDataRoot, resolveStorageRoot } from './runtime-paths.js'

export interface CosConfig {
  secretId: string
  secretKey: string
  bucket: string
  region: string
  publicBaseUrl?: string
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')

function parseLooseEnvFile(filePath: string) {
  const values: Record<string, string> = {}
  if (!fs.existsSync(filePath)) return values

  const raw = fs.readFileSync(filePath, 'utf8')
  for (const sourceLine of raw.split(/\r?\n/)) {
    const line = sourceLine.trim()
    if (!line || line.startsWith('#')) continue

    const keyValue = line.match(/^([^=]+)=(.*)$/)
    if (!keyValue) continue
    values[keyValue[1].trim()] = keyValue[2].trim().replace(/^["']|["']$/g, '')
  }

  return values
}

function envValue(looseEnv: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key] ?? looseEnv[key]
    if (value != null && String(value).trim()) return String(value).trim()
  }
  return ''
}

export function getCosConfig(): CosConfig | null {
  const looseEnv = parseLooseEnvFile(path.join(PROJECT_ROOT, '.env'))
  const secretId = envValue(looseEnv, 'TENCENT_SECRET_ID', 'COS_SECRET_ID')
  const secretKey = envValue(looseEnv, 'TENCENT_SECRET_KEY', 'COS_SECRET_KEY')
  const bucket = envValue(looseEnv, 'TENCENT_COS_BUCKET', 'COS_BUCKET')
  const region = envValue(looseEnv, 'TENCENT_COS_REGION', 'COS_REGION')
  const publicBaseUrl = envValue(looseEnv, 'TENCENT_COS_PUBLIC_BASE_URL', 'COS_PUBLIC_BASE_URL')

  if (!secretId && !secretKey && !bucket && !region) return null
  if (!secretId || !secretKey || !bucket || !region) {
    throw new Error('Incomplete Tencent COS config: TENCENT_SECRET_ID, TENCENT_SECRET_KEY, TENCENT_COS_BUCKET and TENCENT_COS_REGION are required')
  }

  return { secretId, secretKey, bucket, region, publicBaseUrl: publicBaseUrl || undefined }
}

function cosHost(config: Pick<CosConfig, 'bucket' | 'region'>) {
  return `${config.bucket}.cos.${config.region}.myqcloud.com`
}

function encodeObjectKey(key: string) {
  return key.split('/').map(segment => encodeURIComponent(segment)).join('/')
}

function normalizeStaticPath(value: string) {
  return String(value || '').trim().replace(/^\/+/, '').replace(/\\/g, '/')
}

function pathExt(value: string) {
  return path.extname(value).toLowerCase()
}

function isImagePath(value: string) {
  return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(pathExt(value))
}

function isVideoPath(value: string) {
  return ['.mp4', '.mov', '.webm'].includes(pathExt(value))
}

function staticSubPath(value: string) {
  const normalized = normalizeStaticPath(value)
  return normalized.startsWith('static/') ? normalized.slice('static/'.length) : normalized
}

export function staticAssetToCosObjectKey(value: string) {
  const normalized = normalizeStaticPath(value)
  if (!normalized) return normalized
  if (/^https?:\/\//i.test(normalized)) return normalized
  if (normalized.startsWith('seedream/') || normalized.startsWith('seedance/') || normalized.startsWith('audio/')) {
    return normalized
  }

  const subPath = staticSubPath(normalized)
  if (
    subPath.startsWith('images/') ||
    subPath.startsWith('grid-cells/') ||
    isImagePath(subPath)
  ) {
    return `seedream/${subPath}`
  }
  if (
    subPath.startsWith('videos/') ||
    subPath.startsWith('composed/') ||
    subPath.startsWith('merged/') ||
    isVideoPath(subPath)
  ) {
    return `seedance/${subPath}`
  }
  if (subPath.startsWith('audio/')) {
    return subPath
  }

  return subPath
}

export function cosObjectKeyToStaticPath(value: string) {
  const normalized = normalizeStaticPath(value)
  if (!normalized || normalized.startsWith('static/')) return normalized

  const mappings: Array<[string, string]> = [
    ['seedream/images/', 'static/images/'],
    ['seedream/grid-cells/', 'static/grid-cells/'],
    ['seedance/videos/', 'static/videos/'],
    ['seedance/composed/', 'static/composed/'],
    ['seedance/merged/', 'static/merged/'],
    ['audio/', 'static/audio/'],
  ]

  for (const [cosPrefix, staticPrefix] of mappings) {
    if (normalized.startsWith(cosPrefix)) {
      return `${staticPrefix}${normalized.slice(cosPrefix.length)}`
    }
  }

  if (normalized.startsWith('seedream/')) return `static/images/${normalized.slice('seedream/'.length)}`
  if (normalized.startsWith('seedance/')) return `static/videos/${normalized.slice('seedance/'.length)}`
  return normalized
}

export function buildCosObjectUrl(key: string, config: Pick<CosConfig, 'bucket' | 'region' | 'publicBaseUrl'>) {
  const baseUrl = config.publicBaseUrl || `https://${cosHost(config)}`
  return `${baseUrl.replace(/\/+$/, '')}/${encodeObjectKey(normalizeStaticPath(key))}`
}

export function cosUrlToStaticPath(value: string, config: Pick<CosConfig, 'bucket' | 'region' | 'publicBaseUrl'> | null = getCosConfig()) {
  const raw = String(value || '').trim()
  if (!raw || !config) return raw

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return raw
  }

  const allowedHosts = new Set<string>([cosHost(config)])
  if (config.publicBaseUrl) {
    try {
      allowedHosts.add(new URL(config.publicBaseUrl).host)
    } catch {}
  }

  if (!allowedHosts.has(url.host)) return raw
  return cosObjectKeyToStaticPath(decodeURIComponent(url.pathname.replace(/^\/+/, '')))
}

export function staticAssetToLocalPath(
  value: string,
  dataRoot = resolveDataRoot(PROJECT_ROOT),
  storageRoot = resolveStorageRoot(PROJECT_ROOT),
  config: Pick<CosConfig, 'bucket' | 'region' | 'publicBaseUrl'> | null = getCosConfig(),
) {
  const normalized = cosUrlToStaticPath(value, config)
  if (path.isAbsolute(normalized)) return normalized
  if (/^https?:\/\//i.test(normalized)) return normalized

  const localPath = normalizeStaticPath(normalized)
  if (localPath.startsWith('static/')) return path.join(dataRoot, localPath)
  return path.join(storageRoot, localPath)
}

function sha1Hex(value: string) {
  return crypto.createHash('sha1').update(value).digest('hex')
}

function hmacSha1Hex(key: string, value: string) {
  return crypto.createHmac('sha1', key).update(value).digest('hex')
}

function contentTypeForPath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.mp4') return 'video/mp4'
  if (ext === '.mov') return 'video/quicktime'
  return 'application/octet-stream'
}

function createAuthorization(method: string, uriPath: string, config: CosConfig) {
  const host = cosHost(config)
  const now = Math.floor(Date.now() / 1000)
  const expires = now + 3600
  const keyTime = `${now};${expires}`
  const signTime = keyTime
  const httpString = `${method.toLowerCase()}\n${uriPath}\n\nhost=${host}\n`
  const stringToSign = `sha1\n${signTime}\n${sha1Hex(httpString)}\n`
  const signKey = hmacSha1Hex(config.secretKey, keyTime)
  const signature = hmacSha1Hex(signKey, stringToSign)

  return [
    'q-sign-algorithm=sha1',
    `q-ak=${config.secretId}`,
    `q-sign-time=${signTime}`,
    `q-key-time=${keyTime}`,
    'q-header-list=host',
    'q-url-param-list=',
    `q-signature=${signature}`,
  ].join('&')
}

export async function uploadFileToCos(filePath: string, key: string, config: CosConfig = getCosConfig() as CosConfig) {
  if (!config) return null

  const normalizedKey = normalizeStaticPath(key)
  const uriPath = `/${encodeObjectKey(normalizedKey)}`
  const stat = fs.statSync(filePath)

  await new Promise<void>((resolve, reject) => {
    const req = https.request({
      method: 'PUT',
      host: cosHost(config),
      path: uriPath,
      headers: {
        Authorization: createAuthorization('PUT', uriPath, config),
        'Content-Type': contentTypeForPath(filePath),
        'Content-Length': stat.size,
      },
    }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve()
          return
        }
        const body = Buffer.concat(chunks).toString('utf8')
        reject(new Error(`COS upload failed ${res.statusCode}: ${body.slice(0, 500)}`))
      })
    })

    req.on('error', reject)
    fs.createReadStream(filePath).pipe(req)
  })

  return buildCosObjectUrl(normalizedKey, config)
}

export async function uploadStaticAssetToCos(relativePath: string, absolutePath?: string) {
  const config = getCosConfig()
  const localRelativePath = cosObjectKeyToStaticPath(normalizeStaticPath(relativePath))
  const objectKey = staticAssetToCosObjectKey(localRelativePath)
  if (!config) return null

  const filePath = absolutePath || staticAssetToLocalPath(localRelativePath, undefined, undefined, config)
  if (!fs.existsSync(filePath)) throw new Error(`Cannot upload missing file to COS: ${filePath}`)
  return uploadFileToCos(filePath, objectKey, config)
}
