export function externalAssetRedirectUrl(requestUrl: string) {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }

  const path = url.pathname
  if (path.startsWith('/https://')) return safeExternalAssetUrl(`https://${path.slice('/https://'.length)}${url.search}`)
  if (path.startsWith('/http://')) return safeExternalAssetUrl(`http://${path.slice('/http://'.length)}${url.search}`)
  return null
}

function safeExternalAssetUrl(target: string) {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!/\.(?:jpe?g|png|webp|gif|mp4|mov|webm|m4a|mp3|wav|aac|vtt)$/i.test(url.pathname)) return null
  return url.toString()
}
