export const PROJECT_STYLE_OPTIONS = [
  { label: '写实', value: 'realistic' },
  { label: '电影感', value: 'cinematic' },
  { label: '国风写实', value: 'guofeng' },
  { label: '动漫', value: 'anime' },
  { label: '水墨风', value: 'ink_wash' },
  { label: '赛博朋克', value: 'cyberpunk' },
] as const

export const DEFAULT_PROJECT_STYLE = 'realistic'

const projectStyleLabelMap = new Map<string, string>(PROJECT_STYLE_OPTIONS.map(option => [option.value, option.label]))
const projectStyleValueMap = new Map<string, string>(PROJECT_STYLE_OPTIONS.flatMap(option => [
  [option.value, option.value],
  [option.label, option.value],
]))
const legacyProjectStyleValueMap = new Map<string, string>([
  ['二次元', 'anime'],
  ['二次元动漫', 'anime'],
])

export function getProjectStyleLabel(style?: string | null) {
  const normalized = String(style || '').trim()
  if (!normalized) return ''
  const legacyValue = legacyProjectStyleValueMap.get(normalized)
  return projectStyleLabelMap.get(normalized) || (legacyValue ? projectStyleLabelMap.get(legacyValue) : '') || normalized
}

export function getProjectStyleInputValue(style?: string | null) {
  return getProjectStyleLabel(style)
}

export function normalizeProjectStyleInput(style?: string | null) {
  const normalized = String(style || '').trim()
  if (!normalized) return ''
  return projectStyleValueMap.get(normalized) || legacyProjectStyleValueMap.get(normalized) || normalized
}
