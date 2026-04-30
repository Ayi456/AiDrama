export type NormalizedToolCall = {
  toolName: string | null
  args: unknown
}

export type NormalizedToolResult = {
  toolName: string | null
  result: string
}

export type NormalizedAgentResult = {
  text: string
  toolCalls: NormalizedToolCall[]
  toolResults: NormalizedToolResult[]
}

const GENERIC_TOOL_EVENT_TYPES = new Set([
  'tool-call',
  'tool-result',
  'tool-call-delta',
  'tool-call-streaming-start',
])

function meaningfulToolName(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || GENERIC_TOOL_EVENT_TYPES.has(trimmed)) return null
  return trimmed
}

export function normalizeToolName(entry: any) {
  const candidates = [
    entry?.toolName,
    entry?.tool?.toolName,
    entry?.tool?.id,
    entry?.toolCall?.toolName,
    entry?.toolCall?.name,
    entry?.toolResult?.toolName,
    entry?.result?.toolName,
    entry?.output?.toolName,
    entry?.data?.toolName,
    entry?.payload?.toolName,
    entry?.name,
    entry?.type,
  ]

  for (const candidate of candidates) {
    const toolName = meaningfulToolName(candidate)
    if (toolName) return toolName
  }

  return null
}

function normalizeToolResult(entry: any) {
  const result = entry?.result ?? entry?.output ?? entry?.data ?? entry?.payload?.result ?? null
  return typeof result === 'string' ? result : JSON.stringify(result)
}

export function normalizeAgentResult(result: any): NormalizedAgentResult {
  const toolCalls = result.toolCalls || []
  const toolResults = result.toolResults || []
  return {
    text: result.text || '',
    toolCalls: toolCalls.map((tc: any) => ({
      toolName: normalizeToolName(tc),
      args: tc?.args ?? tc?.input ?? tc?.payload?.args ?? null,
    })),
    toolResults: toolResults.map((tr: any) => ({
      toolName: normalizeToolName(tr),
      result: normalizeToolResult(tr),
    })),
  }
}

function parseToolResult(result: string) {
  try {
    return JSON.parse(result)
  } catch {
    return null
  }
}

function isSuccessfulAppendResult(value: any) {
  return value
    && typeof value === 'object'
    && typeof value.message === 'string'
    && /^Appended \d+ storyboards\b/.test(value.message)
    && Number.isFinite(Number(value.count))
}

export function wasToolUsed(result: NormalizedAgentResult, toolName: string) {
  if (result.toolCalls.some((toolCall) => toolCall.toolName === toolName)) return true
  if (result.toolResults.some((toolResult) => toolResult.toolName === toolName)) return true

  if (toolName === 'append_storyboards') {
    return result.toolResults.some((toolResult) => isSuccessfulAppendResult(parseToolResult(toolResult.result)))
  }

  return false
}
