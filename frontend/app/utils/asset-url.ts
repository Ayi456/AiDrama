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
    return `/api/v1/assets/proxy?url=${encodeURIComponent(src)}`
  }
  return src.startsWith('/') ? src : `/${src}`
}
