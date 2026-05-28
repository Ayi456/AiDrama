export const PROJECT_STYLE_OPTIONS = [
  { label: '写实', value: '写实' },
  { label: '电影感', value: '电影感' },
  { label: '国风写实', value: '国风写实' },
  { label: '动漫', value: '动漫' },
  { label: '水墨风', value: '水墨风' },
  { label: '赛博朋克', value: '赛博朋克' },
] as const

export const DEFAULT_PROJECT_STYLE = '写实'

export function getProjectStyleLabel(style?: string | null) {
  return String(style || '').trim()
}

export function getProjectStyleInputValue(style?: string | null) {
  return String(style || '').trim()
}

export function normalizeProjectStyleInput(style?: string | null) {
  return String(style || '').trim()
}
