import { Agent, fetch as undiciFetch } from 'undici'

// 非流式的 Agent.generate() 里，服务商要整段生成完才返回响应头，所以这个超时实际约束的是
// “单次模型调用”的总时长（headersTimeout）。它必须明显低于 serverless 函数的执行上限
// （SCF 900s）——这样单次调用卡住/过慢时能快速失败并抛出真实错误，而不是耗满预算后被平台
// 静默杀掉（返回 433、拿不到错误信息）。可用 AI_REQUEST_TIMEOUT_MS 覆盖。
// 注意：必须用 undici 自带的 fetch 才能传入 undici 的 Agent dispatcher，
// Node 内置 fetch 会拒绝外部 undici 的 dispatcher（UND_ERR_INVALID_ARG）。
// Keep this above the storyboard chunk deadline (10 min by default) so route-level
// aborts can return the clearer business error before undici cuts the request.
export const DEFAULT_AI_REQUEST_TIMEOUT_MS = 660_000 // 11 min, per HTTP call

export function resolveAiRequestTimeoutMs(value: unknown = process.env.AI_REQUEST_TIMEOUT_MS): number {
  const raw = Number(value)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AI_REQUEST_TIMEOUT_MS
}

const timeoutMs = resolveAiRequestTimeoutMs()

const aiDispatcher = new Agent({
  headersTimeout: timeoutMs,
  bodyTimeout: timeoutMs,
  connectTimeout: 30_000,
})

export const aiFetch: typeof fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
  undiciFetch(input as Parameters<typeof undiciFetch>[0], {
    ...(init as Parameters<typeof undiciFetch>[1]),
    dispatcher: aiDispatcher,
  })) as unknown as typeof fetch
