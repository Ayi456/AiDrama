import type { AIConfig, ProviderRequest } from './adapters/types.js'
import type { MediaJobSnapshotField } from './media-job-state.js'

export type ProviderExchangeSnapshotField = MediaJobSnapshotField

export type ProviderGenerationRequest = Omit<ProviderRequest, 'body'> & {
  body?: unknown
}

export type ProviderPollRequestAdapter = {
  buildPollRequest: (config: AIConfig, taskId: string) => ProviderRequest
}

export type PrepareProviderPollInput = {
  id: number
  taskId: string
  attemptNumber: number
  config: AIConfig
  adapter: ProviderPollRequestAdapter
  redactUrl: (url: string) => string
}

export type ProviderPollLogContext = {
  id: number
  taskId: string
  provider: string
  method: string
  url: string
  attempt: number
}

export type PreparedProviderPollAttempt = {
  providerRequest: ProviderGenerationRequest
  logContext: ProviderPollLogContext
}

export type PrepareProviderGenerationAttemptInput = {
  id: number
  config: AIConfig
  providerRequest: ProviderGenerationRequest
  extraLogContext?: Record<string, unknown>
  redactUrl: (url: string) => string
}

export type ProviderGenerationLogContext = {
  id: number
  provider: string
  method: string
  url: string
} & Record<string, unknown>

export type ProviderGenerationPayloadContext = {
  id: number
  method: string
  url: string
  headers: Record<string, string>
  body?: unknown
}

export type PreparedProviderGenerationAttempt = {
  requestLogContext: ProviderGenerationLogContext
  requestPayload: ProviderGenerationPayloadContext
}

export type SubmitProviderGenerationInput = {
  normalizedSpec: unknown
  providerRequest: ProviderGenerationRequest
  timeoutMs?: number
}

export type SubmitProviderGenerationDeps = {
  now: () => string
  persistSnapshot: (
    field: ProviderExchangeSnapshotField,
    payload: unknown,
    timestamp: string,
  ) => Promise<void>
  sendJsonRequest: (request: ProviderGenerationRequest & { timeoutMs?: number }) => Promise<unknown>
}

export type SubmitProviderPollInput = {
  providerRequest: ProviderGenerationRequest
  timeoutMs?: number
}

export type SubmitProviderPollDeps = {
  now: () => string
  isProviderApiError: (error: unknown) => boolean
  persistSnapshot: (
    field: ProviderExchangeSnapshotField,
    payload: unknown,
    timestamp: string,
  ) => Promise<void>
  sendJsonRequest: (request: ProviderGenerationRequest & { timeoutMs?: number }) => Promise<unknown>
}

export type ProviderPollAttemptResult =
  | { type: 'response'; result: unknown }
  | { type: 'continue' }

export function prepareProviderPollAttempt(input: PrepareProviderPollInput): PreparedProviderPollAttempt {
  const { url, method, headers } = input.adapter.buildPollRequest(input.config, input.taskId)

  return {
    providerRequest: { url, method, headers },
    logContext: {
      id: input.id,
      taskId: input.taskId,
      provider: input.config.provider,
      method,
      url: input.redactUrl(url),
      attempt: input.attemptNumber,
    },
  }
}

export function prepareProviderGenerationAttempt(
  input: PrepareProviderGenerationAttemptInput,
): PreparedProviderGenerationAttempt {
  const { url, method, headers, body } = input.providerRequest

  return {
    requestLogContext: {
      id: input.id,
      provider: input.config.provider,
      method,
      url: input.redactUrl(url),
      ...input.extraLogContext,
    },
    requestPayload: {
      id: input.id,
      method,
      url,
      headers,
      body,
    },
  }
}

export async function submitProviderGenerationRequest(
  input: SubmitProviderGenerationInput,
  deps: SubmitProviderGenerationDeps,
) {
  await deps.persistSnapshot('normalizedRequest', input.normalizedSpec, deps.now())
  await deps.persistSnapshot('providerRequest', input.providerRequest.body, deps.now())

  const request = input.timeoutMs === undefined
    ? input.providerRequest
    : { ...input.providerRequest, timeoutMs: input.timeoutMs }
  const result = await deps.sendJsonRequest(request)

  await deps.persistSnapshot('providerResponse', result, deps.now())
  return result
}

export async function submitProviderPollAttempt(
  input: SubmitProviderPollInput,
  deps: SubmitProviderPollDeps,
): Promise<ProviderPollAttemptResult> {
  const request = input.timeoutMs === undefined
    ? input.providerRequest
    : { ...input.providerRequest, timeoutMs: input.timeoutMs }

  let result: unknown
  try {
    result = await deps.sendJsonRequest(request)
  } catch (error) {
    if (deps.isProviderApiError(error)) return { type: 'continue' }
    throw error
  }

  await deps.persistSnapshot('providerResponse', result, deps.now())
  return { type: 'response', result }
}
