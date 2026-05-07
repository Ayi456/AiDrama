type PlainRecord = Record<string, unknown>

/**
 * Convert shallow camelCase or acronym-heavy keys into snake_case for API responses.
 */
function toSnakeCaseKey(key: string) {
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
}

export function toSnakeCase(obj: PlainRecord): PlainRecord {
  const result: PlainRecord = {}
  for (const [key, value] of Object.entries(obj)) {
    result[toSnakeCaseKey(key)] = value
  }
  return result
}

export function toSnakeCaseArray(arr: PlainRecord[]): PlainRecord[] {
  return arr.map(toSnakeCase)
}
