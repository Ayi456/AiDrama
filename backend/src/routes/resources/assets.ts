import { Hono } from 'hono'

import {
  parseAssetProxyTarget,
  redirectAssetProxyTarget,
  shouldRedirectAssetProxyTarget,
} from '../../utils/asset-proxy.js'
import { createCosRequestAuthorization } from '../../utils/cos.js'

const app = new Hono()

const FORWARDED_RESPONSE_HEADERS = [
  'accept-ranges',
  'cache-control',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'last-modified',
]

function buildProxyResponseHeaders(upstream: Response) {
  const headers = new Headers()
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }

  if (!headers.has('content-type')) headers.set('content-type', 'application/octet-stream')
  if (!headers.has('cache-control')) headers.set('cache-control', 'public, max-age=86400')
  headers.set('content-disposition', 'inline')
  headers.set('x-content-type-options', 'nosniff')
  return headers
}

app.get('/proxy', async (c) => {
  const target = parseAssetProxyTarget(c.req.query('url') || '')
  if (!target) {
    return new Response('Invalid asset proxy target', { status: 400 })
  }
  if (shouldRedirectAssetProxyTarget(target)) {
    return redirectAssetProxyTarget(target)
  }

  const headers: Record<string, string> = {
    'User-Agent': 'AiDramaAssetProxy/1.0',
  }
  const range = c.req.header('range')
  if (range) headers.Range = range
  const authorization = createCosRequestAuthorization('GET', target)
  if (authorization) headers.Authorization = authorization

  const upstream = await fetch(target.href, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000),
  })

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => '')
    return new Response(`Asset proxy failed ${upstream.status}: ${body.slice(0, 500)}`, {
      status: upstream.status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: buildProxyResponseHeaders(upstream),
  })
})

export default app
