import { Agent, fetch as undiciFetch } from 'undici'

// Node 内置 fetch(undici) 默认 headersTimeout/bodyTimeout 为 300s。非流式的 Agent.generate()
// 对慢模型（尤其分镜拆解）很容易超过 5 分钟，触发 UND_ERR_HEADERS_TIMEOUT。
// 注意：必须用 undici 自带的 fetch 才能传入 undici 的 Agent dispatcher，
// Node 内置 fetch 会拒绝外部 undici 的 dispatcher（UND_ERR_INVALID_ARG）。
const DEFAULT_AI_REQUEST_TIMEOUT_MS = 900_000 // 15 min

function resolveTimeoutMs(): number {
  const raw = Number(process.env.AI_REQUEST_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_AI_REQUEST_TIMEOUT_MS
}

const timeoutMs = resolveTimeoutMs()

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
