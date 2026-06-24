import type { Context } from 'hono'

export type RouteBody = Record<string, unknown>

export async function readJsonBody(c: Pick<Context, 'req'>): Promise<RouteBody> {
  try {
    const body = await c.req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body as RouteBody : {}
  } catch {
    return {}
  }
}

export function hasOwn(body: RouteBody, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key)
}

export function readBodyString(body: RouteBody, key: string): string | undefined {
  const value = body[key]
  return typeof value === 'string' ? value : undefined
}

export function readBodyNumber(body: RouteBody, key: string): number | undefined {
  const value = body[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function readBodyText(body: RouteBody, ...keys: string[]) {
  for (const key of keys) {
    const value = readBodyString(body, key)
    if (value !== undefined) return value.trim()
  }
  return ''
}

export function readBodyId(body: RouteBody, ...keys: string[]) {
  for (const key of keys) {
    const value = readBodyNumber(body, key)
    if (value !== undefined) return value
  }
  return 0
}

export function readBodyObjectArray(body: RouteBody, key: string): RouteBody[] {
  const value = body[key]
  if (!Array.isArray(value)) return []
  return value.filter((item): item is RouteBody => !!item && typeof item === 'object' && !Array.isArray(item))
}
