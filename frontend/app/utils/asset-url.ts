const STREAMING_MEDIA_PATH_RE = /\.(?:mp4|mov|webm|m4a|mp3|wav|aac)$/i

function isStreamingMediaUrl(url: URL) {
  return STREAMING_MEDIA_PATH_RE.test(decodeURIComponent(url.pathname))
}

function isTencentCosUrl(url: URL) {
  return /\.cos\.[a-z0-9-]+\.myqcloud\.com$/i.test(url.host)
}

export function assetUrl(value?: string | null) {
  const src = String(value || '').trim()
  if (!src) return ''
  if (/^(data:|blob:)/i.test(src)) return src
  if (/^https?:\/\//i.test(src)) {
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(src)
        if (url.origin === window.location.origin) return `${url.pathname}${url.search}${url.hash}`
      } catch {}
    }
    try {
      const url = new URL(src)
      if (url.protocol === 'https:' && isStreamingMediaUrl(url) && !isTencentCosUrl(url)) return src
    } catch {}
    return `/api/v1/assets/proxy?url=${encodeURIComponent(src)}`
  }
  return src.startsWith('/') ? src : `/${src}`
}
