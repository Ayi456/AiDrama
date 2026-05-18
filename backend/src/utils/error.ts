export function errorMessageFromUnknown(error: unknown, fallback = 'Request failed'): string {
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'string') return error || fallback
  return fallback
}
