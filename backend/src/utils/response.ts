import type { Context } from 'hono'

function normalizeData<T>(data: T | null | undefined): T | null {
  return data ?? null
}

export function success<T>(c: Context, data?: T | null) {
  return c.json({ code: 200, data: normalizeData(data), message: 'success' })
}

export function created<T>(c: Context, data?: T | null) {
  return c.json({ code: 201, data: normalizeData(data), message: 'created' }, 201)
}

export function badRequest(c: Context, message = 'bad request') {
  return c.json({ code: 400, message }, 400)
}

export function notFound(c: Context, message = 'not found') {
  return c.json({ code: 404, message }, 404)
}

export function serverError(c: Context, message = 'internal error') {
  return c.json({ code: 500, message }, 500)
}

export function now() {
  return new Date().toISOString()
}
