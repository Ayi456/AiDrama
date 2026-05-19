export type UnknownRecord = Record<string, unknown>

export function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function readRecord(value: unknown, key: string): UnknownRecord | null {
  if (!isRecord(value)) return null
  const nested = value[key]
  return isRecord(nested) ? nested : null
}

export function readString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined
  const nested = value[key]
  return typeof nested === 'string' ? nested : undefined
}

export function readBoolean(value: unknown, key: string): boolean | undefined {
  if (!isRecord(value)) return undefined
  const nested = value[key]
  return typeof nested === 'boolean' ? nested : undefined
}

export function readNumber(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined
  const nested = value[key]
  if (typeof nested === 'number' && Number.isFinite(nested)) return nested
  if (typeof nested === 'string' && nested.trim()) {
    const parsed = Number(nested)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
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

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item ?? '').trim()).filter(Boolean)
}
