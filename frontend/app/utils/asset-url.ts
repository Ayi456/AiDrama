export function assetUrl(value?: string | null) {
  const src = String(value || '').trim()
  if (!src) return ''
  if (/^(https?:|data:|blob:)/i.test(src)) return src
  return src.startsWith('/') ? src : `/${src}`
}
