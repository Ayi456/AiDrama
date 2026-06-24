export type UnknownRecord = Record<string, unknown>

export function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

export function readStringField(value: unknown, field: string): string | undefined {
  if (!isRecord(value)) return undefined
  return readString(value[field])
}

export function readRecordField(value: unknown, field: string): UnknownRecord | null {
  if (!isRecord(value)) return null
  return isRecord(value[field]) ? value[field] : null
}

export function readOutputRecord(value: unknown): UnknownRecord {
  return readRecordField(value, 'output') || {}
}

export function parseJsonStringArray(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => String(item ?? '').trim()).filter(Boolean)
  } catch {
    return []
  }
}
