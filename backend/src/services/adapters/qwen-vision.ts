export interface VisionAnalyzeParams {
  videoUrl: string
  prompt: string
  baseUrl: string
  apiKey: string
  model: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export type VisionVerdict = 'complete' | 'defect' | 'unknown'

export interface VisionAnalyzeResult {
  rawText: string
  verdict: VisionVerdict
  missingActions: string[]
}

const VERDICT_PATTERN = /^\[结论:(完整|穿帮)\]$/
const MISSING_ACTIONS_PATTERN = /^\[缺失动作\]:\s*(.+)$/

function joinUrl(baseUrl: string, path: string) {
  const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  const prefixedPath = path.startsWith('/') ? path : `/${path}`
  return `${trimmedBase}${prefixedPath}`
}

function extractContentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === 'object' && 'text' in (part as Record<string, unknown>)) {
          const text = (part as { text?: unknown }).text
          return typeof text === 'string' ? text : ''
        }
        return ''
      })
      .join('')
  }
  return ''
}

export function parseVisionVerdict(rawText: string): { verdict: VisionVerdict; missingActions: string[] } {
  const lines = rawText.replace(/\s+$/g, '').split(/\r?\n/)
  if (lines.length === 0) return { verdict: 'unknown', missingActions: [] }
  const lastLine = lines[lines.length - 1].trim()
  const verdictMatch = VERDICT_PATTERN.exec(lastLine)
  if (!verdictMatch) return { verdict: 'unknown', missingActions: [] }
  const verdict: VisionVerdict = verdictMatch[1] === '完整' ? 'complete' : 'defect'

  let missingActions: string[] = []
  if (verdict === 'defect') {
    for (let i = lines.length - 2; i >= 0; i -= 1) {
      const line = lines[i].trim()
      if (!line) continue
      const m = MISSING_ACTIONS_PATTERN.exec(line)
      if (m) {
        missingActions = m[1].split('|').map((s) => s.trim()).filter(Boolean)
      }
      break
    }
  }
  return { verdict, missingActions }
}

export async function analyzeVideoForDefects(params: VisionAnalyzeParams): Promise<VisionAnalyzeResult> {
  const fetchImpl = params.fetchImpl ?? fetch
  const url = joinUrl(params.baseUrl, '/compatible-mode/v1/chat/completions')
  const body = {
    model: params.model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'video_url', video_url: { url: params.videoUrl } },
          { type: 'text', text: params.prompt },
        ],
      },
    ],
  }

  const controller = new AbortController()
  const timeoutMs = params.timeoutMs ?? 120_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let resp: Response
  try {
    resp = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`qwen-vision HTTP ${resp.status}: ${text.slice(0, 240)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`qwen-vision unparseable JSON: ${text.slice(0, 240)}`)
  }
  const rawContent = (parsed as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content
  const rawText = extractContentText(rawContent)
  const { verdict, missingActions } = parseVisionVerdict(rawText)
  return { rawText, verdict, missingActions }
}
