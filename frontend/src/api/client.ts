import { getErrorMessage, normalizeApiErrorMessage } from './errors.ts'
import type { ApiEntity, ApiEnvelope, ApiMethod, ApiRequestBody } from './types.ts'

const BASE = '/api/v1'

async function request<T = ApiEntity>(method: ApiMethod, path: string, body?: ApiRequestBody): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const options: RequestInit = { method, headers, credentials: 'include' }
  if (body) options.body = JSON.stringify(body)

  const start = performance.now()
  console.log(`%c[API] %c${method} %c${path}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', body || '')

  try {
    const response = await fetch(`${BASE}${path}`, options)
    const json = await response.json() as ApiEnvelope<T>
    const elapsedMs = Math.round(performance.now() - start)

    if (!response.ok || (json.code && json.code >= 400)) {
      console.log(`%c[API] %c${method} ${path} %c${response.status} %c${elapsedMs}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', json.message || '')
      throw new Error(normalizeApiErrorMessage(json.message || `${response.status}`))
    }

    console.log(`%c[API] %c${method} ${path} %c${response.status} %c${elapsedMs}ms`, 'color:#888', 'color:#66bb6a', 'color:#66bb6a;font-weight:bold', 'color:#888')
    return (json.data ?? json) as T
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    if (!message.match(/^\d{3}$/)) {
      const elapsedMs = Math.round(performance.now() - start)
      console.log(`%c[API] %c${method} ${path} %cERROR %c${elapsedMs}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', message)
    }
    throw error
  }
}

export async function uploadRequest<T = ApiEntity>(path: string, formData: FormData): Promise<T> {
  const start = performance.now()
  console.log(`%c[API] %cPOST %c${path}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', '[multipart]')

  try {
    const response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    const json = await response.json() as ApiEnvelope<T>
    const elapsedMs = Math.round(performance.now() - start)

    if (!response.ok || (json.code && json.code >= 400)) {
      console.log(`%c[API] %cPOST ${path} %c${response.status} %c${elapsedMs}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', json.message || '')
      throw new Error(normalizeApiErrorMessage(json.message || `${response.status}`))
    }

    console.log(`%c[API] %cPOST ${path} %c${response.status} %c${elapsedMs}ms`, 'color:#888', 'color:#66bb6a', 'color:#66bb6a;font-weight:bold', 'color:#888')
    return (json.data ?? json) as T
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    if (!message.match(/^\d{3}$/)) {
      const elapsedMs = Math.round(performance.now() - start)
      console.log(`%c[API] %cPOST ${path} %cERROR %c${elapsedMs}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', message)
    }
    throw error
  }
}

export const api = {
  get: <T = ApiEntity>(path: string) => request<T>('GET', path),
  post: <T = ApiEntity>(path: string, body?: ApiRequestBody) => request<T>('POST', path, body),
  put: <T = ApiEntity>(path: string, body?: ApiRequestBody) => request<T>('PUT', path, body),
  patch: <T = ApiEntity>(path: string, body?: ApiRequestBody) => request<T>('PATCH', path, body),
  del: <T = ApiEntity>(path: string) => request<T>('DELETE', path),
}
