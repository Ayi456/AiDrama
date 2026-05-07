export type ProviderFetchResponse = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
  text: () => Promise<string>
}

export type ProviderFetch = (url: string, init: RequestInit) => Promise<ProviderFetchResponse>

export class ProviderApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly responseText: string,
  ) {
    super(`API error ${status}: ${responseText}`)
    this.name = 'ProviderApiError'
  }
}

export function isProviderApiError(error: unknown): error is ProviderApiError {
  return error instanceof ProviderApiError
}

type SendProviderJsonRequestOptions = {
  url: string
  method: string
  headers: Record<string, string>
  body?: unknown
  timeoutMs?: number
  fetchImpl?: ProviderFetch
}

export async function sendProviderJsonRequest({
  url,
  method,
  headers,
  body,
  timeoutMs,
  fetchImpl = fetch as ProviderFetch,
}: SendProviderJsonRequestOptions) {
  const init: RequestInit = {
    method,
    headers,
  }

  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }

  if (timeoutMs) {
    init.signal = AbortSignal.timeout(timeoutMs)
  }

  const response = await fetchImpl(url, init)
  if (!response.ok) {
    throw new ProviderApiError(response.status, await response.text())
  }

  return response.json()
}
