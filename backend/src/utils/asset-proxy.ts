import type { CosConfig } from './cos.js'
import { getCosConfig } from './cos.js'

const ASSET_PATH_RE = /\.(?:jpe?g|png|webp|gif|mp4|mov|webm|m4a|mp3|wav|aac|vtt)$/i
const STREAMING_MEDIA_PATH_RE = /\.(?:mp4|mov|webm|m4a|mp3|wav|aac)$/i
const VOLCENGINE_TOS_SUFFIX = '.tos-cn-beijing.volces.com'

function configuredCosHost(config: Pick<CosConfig, 'bucket' | 'region'>) {
  return `${config.bucket}.cos.${config.region}.myqcloud.com`.toLowerCase()
}

function configuredPublicBaseHost(config: Pick<CosConfig, 'publicBaseUrl'>) {
  if (!config.publicBaseUrl) return ''
  try {
    return new URL(config.publicBaseUrl).host.toLowerCase()
  } catch {
    return ''
  }
}

function isVolcengineTosHost(host: string) {
  return host === VOLCENGINE_TOS_SUFFIX.slice(1) || host.endsWith(VOLCENGINE_TOS_SUFFIX)
}

function isConfiguredCosHost(host: string, config: Pick<CosConfig, 'bucket' | 'region' | 'publicBaseUrl'> | null) {
  if (!config) return false
  const normalizedHost = host.toLowerCase()
  if (normalizedHost === configuredCosHost(config)) return true
  const publicBaseHost = configuredPublicBaseHost(config)
  return !!publicBaseHost && normalizedHost === publicBaseHost
}

export function isAllowedAssetProxyTarget(
  value: string,
  config: Pick<CosConfig, 'bucket' | 'region' | 'publicBaseUrl'> | null = getCosConfig(),
) {
  let url: URL
  try {
    url = new URL(String(value || '').trim())
  } catch {
    return false
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
  if (!ASSET_PATH_RE.test(decodeURIComponent(url.pathname))) return false

  const host = url.host.toLowerCase()
  if (isVolcengineTosHost(host)) return true
  if (!config) return false
  if (host === configuredCosHost(config)) return true

  const publicBaseHost = configuredPublicBaseHost(config)
  return !!publicBaseHost && host === publicBaseHost
}

export function parseAssetProxyTarget(value: string) {
  const raw = String(value || '').trim()
  if (!isAllowedAssetProxyTarget(raw)) return null
  return new URL(raw)
}

export function shouldRedirectAssetProxyTarget(
  target: URL,
  config: Pick<CosConfig, 'bucket' | 'region' | 'publicBaseUrl'> | null = getCosConfig(),
) {
  if (!STREAMING_MEDIA_PATH_RE.test(decodeURIComponent(target.pathname))) return false
  if (isConfiguredCosHost(target.host, config)) return false
  return true
}

export function redirectAssetProxyTarget(target: URL) {
  return new Response(null, {
    status: 302,
    headers: {
      location: target.href,
      'referrer-policy': 'no-referrer',
    },
  })
}
