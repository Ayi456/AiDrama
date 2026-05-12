export const PROJECT_STYLE_OPTIONS = [
  { label: '写实', value: 'realistic' },
  { label: '电影感', value: 'cinematic' },
  { label: '国风写实', value: 'guofeng' },
  { label: '二次元', value: 'anime' },
  { label: '水墨风', value: 'ink_wash' },
  { label: '赛博朋克', value: 'cyberpunk' },
] as const

export const DEFAULT_PROJECT_STYLE = 'realistic'

const projectStyleLabelMap = new Map<string, string>(PROJECT_STYLE_OPTIONS.map(option => [option.value, option.label]))

export function getProjectStyleLabel(style?: string | null) {
  const normalized = String(style || '').trim()
  if (!normalized) return ''
  return projectStyleLabelMap.get(normalized) || normalized
}
