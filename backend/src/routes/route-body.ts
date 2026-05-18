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
