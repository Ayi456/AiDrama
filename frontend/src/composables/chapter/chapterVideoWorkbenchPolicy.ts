export type KeyedState<T> = Record<string, T>
export type MediaReference = { url?: string | null; [key: string]: unknown }

export function storyboardStateKey(
  storyboard: { id?: number | string } | null | undefined,
  index: number,
) {
  return String(storyboard?.id || index || 'current')
}

export function setKeyedValue<T>(source: KeyedState<T>, key: string, value: T): KeyedState<T> {
  return { ...source, [key]: value }
}

export function removeKeyedValue<T>(source: KeyedState<T>, key: string): KeyedState<T> {
  if (!Object.prototype.hasOwnProperty.call(source, key)) return source
  const next = { ...source }
  delete next[key]
  return next
}

export function uniqueStrings(values: unknown[]): string[] {
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
}

export function uniqueMediaByUrl<T extends MediaReference>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const url = String(item.url || '').trim()
    if (!url || seen.has(url)) return false
    seen.add(url)
    return true
  })
}
