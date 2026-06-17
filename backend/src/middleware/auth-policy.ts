export function readBearerToken(headerValue: string | undefined) {
  const match = String(headerValue || '').match(/^Bearer\s+(.+?)\s*$/i)
  return match?.[1]?.trim() || ''
}

export function isPublicApiPath(pathname: string) {
  return pathname === '/api/v1/health'
    || pathname.startsWith('/api/v1/auth/')
    || pathname === '/api/v1/assets/proxy'
    || pathname === '/api/v1/payments/alipay/notify'
    || pathname === '/api/v1/payments/alipay/return'
}
