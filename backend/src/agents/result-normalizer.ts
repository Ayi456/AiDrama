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

type UnknownRecord = Record<string, unknown>

const GENERIC_TOOL_EVENT_TYPES = new Set([
  'tool-call',
  'tool-result',
  'tool-call-delta',
  'tool-call-streaming-start',
])

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' ? value as UnknownRecord : null
}

function meaningfulToolName(value: unknown) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || GENERIC_TOOL_EVENT_TYPES.has(trimmed)) return null
  return trimmed
}

function readNestedRecord(record: UnknownRecord | null, key: string) {
  return asRecord(record?.[key])
}

function readToolResultPayload(entry: UnknownRecord | null) {
  return entry?.result
    ?? entry?.output
    ?? entry?.data
    ?? readNestedRecord(entry, 'payload')?.result
    ?? null
}

function stringifyToolResult(value: unknown) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value ?? null)
  } catch {
    return JSON.stringify(String(value))
  }
}

export function normalizeToolName(entry: unknown) {
  const record = asRecord(entry)
  const tool = readNestedRecord(record, 'tool')
  const toolCall = readNestedRecord(record, 'toolCall')
  const toolResult = readNestedRecord(record, 'toolResult')
  const result = readNestedRecord(record, 'result')
  const output = readNestedRecord(record, 'output')
  const data = readNestedRecord(record, 'data')
  const payload = readNestedRecord(record, 'payload')

  const candidates = [
    record?.toolName,
    tool?.toolName,
    tool?.id,
    toolCall?.toolName,
    toolCall?.name,
    toolResult?.toolName,
    result?.toolName,
    output?.toolName,
    data?.toolName,
    payload?.toolName,
    record?.name,
    record?.type,
  ]

  for (const candidate of candidates) {
    const toolName = meaningfulToolName(candidate)
    if (toolName) return toolName
  }

  return null
}

function normalizeToolResult(entry: unknown) {
  return stringifyToolResult(readToolResultPayload(asRecord(entry)))
}

export function normalizeAgentResult(result: unknown): NormalizedAgentResult {
  const record = asRecord(result)
  const toolCalls = Array.isArray(record?.toolCalls) ? record.toolCalls : []
  const toolResults = Array.isArray(record?.toolResults) ? record.toolResults : []

  return {
    text: typeof record?.text === 'string' ? record.text : '',
    toolCalls: toolCalls.map((toolCall) => ({
      toolName: normalizeToolName(toolCall),
      args: readNestedRecord(asRecord(toolCall), 'payload')?.args
        ?? asRecord(toolCall)?.args
        ?? asRecord(toolCall)?.input
        ?? null,
    })),
    toolResults: toolResults.map((toolResult) => ({
      toolName: normalizeToolName(toolResult),
      result: normalizeToolResult(toolResult),
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

function isSuccessfulAppendResult(value: unknown) {
  const record = asRecord(value)
  return record
    && typeof record.message === 'string'
    && /^Appended \d+ storyboards\b/.test(record.message)
    && Number.isFinite(Number(record.count))
}

export function wasToolUsed(result: NormalizedAgentResult, toolName: string) {
  if (result.toolCalls.some((toolCall) => toolCall.toolName === toolName)) return true
  if (result.toolResults.some((toolResult) => toolResult.toolName === toolName)) return true

  if (toolName === 'append_storyboards') {
    return result.toolResults.some((toolResult) => isSuccessfulAppendResult(parseToolResult(toolResult.result)))
  }

  return false
}
