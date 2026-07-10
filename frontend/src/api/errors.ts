function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseJsonObjectFromText(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    return readRecord(JSON.parse(text.slice(start, end + 1)))
  } catch {
    return null
  }
}

function compactErrorText(text: string, fallback = '操作失败') {
  const cleaned = text
    .replace(/Request id:\s*[\w-]+\.?/gi, '')
    .replace(/"request_id"\s*:\s*"[^"]+"/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return fallback
  return cleaned.length > 120 ? `${cleaned.slice(0, 117)}...` : cleaned
}

function friendlyProviderErrorMessage(rawMessage: string): string | null {
  const payload = parseJsonObjectFromText(rawMessage)
  const error = readRecord(payload?.error)
  const code = readString(error?.code)
  const providerMessage = readString(error?.message)
  const param = readString(error?.param)
  const haystack = [code, providerMessage, param, rawMessage].join('\n')

  if (/InputImageSensitiveContentDetected|input image may contain real person/i.test(haystack)) {
    return '图片审核未通过：参考图可能包含真实人物或敏感内容，请更换参考图，或改用文字生成。'
  }

  if (/SensitiveContent|sensitive content|content policy|safety/i.test(haystack)) {
    return '内容安全审核未通过，请调整提示词或参考素材后重试。'
  }

  if (/rate limit|too many requests|429/i.test(haystack)) {
    return '服务请求过于频繁，请稍后再试。'
  }

  if (/timeout|timed out/i.test(haystack)) {
    return '服务响应超时，请稍后重试。'
  }

  return providerMessage ? compactErrorText(providerMessage) : null
}

export function normalizeApiErrorMessage(message: unknown, fallback = '操作失败') {
  const rawMessage = readString(message)
  if (!rawMessage) return fallback

  const friendly = friendlyProviderErrorMessage(rawMessage)
  if (friendly) return friendly

  const apiError = rawMessage.match(/^API error\s+(\d{3})\s*:\s*(.*)$/is)
  if (apiError) {
    const status = apiError[1] ?? ''
    const detail = compactErrorText(apiError[2] || '', '')

    if (status === '400') return detail || '请求参数有误，请检查输入内容后重试。'
    if (status === '401' || status === '403') return '服务鉴权失败，请检查当前 AI 配置的密钥或权限。'
    if (status === '404') return '服务接口不存在，请检查当前 AI 配置的地址或模型。'
    if (status === '429') return '服务请求过于频繁，请稍后再试。'
    if (/^5\d\d$/.test(status)) return '上游服务暂时不可用，请稍后重试。'

    return detail ? `服务请求失败（${status}）：${detail}` : `服务请求失败（${status}）`
  }

  return compactErrorText(rawMessage, fallback)
}

export { getErrorMessage }
