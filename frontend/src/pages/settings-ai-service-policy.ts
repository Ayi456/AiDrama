export type SettingsServiceType = 'text' | 'image' | 'video' | 'vision'

export type SettingsTemplate = {
  control?: {
    generateAudio?: boolean
    returnLastFrame?: boolean
    watermark?: boolean
  }
  providerOptions?: Record<string, unknown>
  [key: string]: unknown
}

export type ProviderPreset = {
  label: string
  baseUrl: string
  models: string[]
}

export const settingsServiceTypes: Array<{ type: SettingsServiceType; label: string }> = [
  { type: 'text', label: '文本' },
  { type: 'image', label: '图片' },
  { type: 'video', label: '视频' },
  { type: 'vision', label: '视频理解' },
]

export const settingsProviders = [
  'ali',
  'chatfire',
  'gemini',
  'minimax',
  'openai',
  'openrouter',
  'vidu',
  'volcengine',
]

export const settingsServiceMeta: Record<SettingsServiceType, { label: string; desc: string }> = {
  text: { label: '文本', desc: '剧本改写、角色场景提取、分镜拆解等 Agent 文本能力' },
  image: { label: '图片', desc: '角色图、场景图、镜头图与首尾帧等静态图像生成' },
  video: { label: '视频', desc: '镜头视频生成，支持单图、多图和首尾帧模式' },
  vision: { label: '视频理解', desc: '用于视频穿帮检测，默认阿里百炼 qwen3.6-plus' },
}

const providerPresets: Record<SettingsServiceType, Record<string, ProviderPreset>> = {
  text: {
    minimax: { label: 'MiniMax 推荐', baseUrl: 'https://api.minimaxi.com', models: ['MiniMax-Text-01'] },
    openrouter: { label: 'OpenRouter 推荐', baseUrl: 'https://openrouter.ai/api', models: ['google/gemini-3-flash-preview'] },
    openai: { label: 'OpenAI 推荐', baseUrl: 'https://api.openai.com', models: ['gpt-4.1-mini'] },
  },
  image: {
    chatfire: { label: 'ChatFire 推荐', baseUrl: 'https://api.chatfire.site', models: ['doubao-seedream-4-5-251128'] },
    gemini: { label: 'Gemini 推荐', baseUrl: 'https://api.chatfire.site', models: ['gemini-3-pro-image-preview'] },
    volcengine: { label: '火山推荐', baseUrl: 'https://ark.cn-beijing.volces.com', models: ['doubao-seedream-4-0-250828'] },
  },
  video: {
    volcengine: { label: 'AiDrama 视频', baseUrl: 'https://api.chatfire.site/volcengine', models: ['doubao-seedance-1-5-pro-251215'] },
    vidu: { label: 'Vidu 推荐', baseUrl: 'https://api.vidu.com', models: ['viduq3-turbo'] },
    ali: { label: '阿里推荐', baseUrl: 'https://dashscope.aliyuncs.com', models: ['wan2.6-i2v-flash'] },
  },
  vision: {
    ali: { label: '阿里推荐', baseUrl: 'https://dashscope.aliyuncs.com', models: ['qwen3.6-plus'] },
  },
}

const providerSettingsTemplates: Record<SettingsServiceType, Record<string, SettingsTemplate>> = {
  text: {
    default: {},
  },
  image: {
    default: {
      control: { watermark: false },
      providerOptions: {},
    },
    volcengine: {
      control: { watermark: false },
      providerOptions: {
        volcengine: {
          output_format: 'png',
          response_format: 'url',
          sequential_image_generation: 'disabled',
        },
      },
    },
  },
  video: {
    default: {
      control: { generateAudio: true, returnLastFrame: false, watermark: false },
      providerOptions: {},
    },
    volcengine: {
      control: { generateAudio: true, returnLastFrame: false, watermark: false },
      providerOptions: {
        volcengine: {
          resolution: '720p',
          draft: false,
        },
      },
    },
  },
  vision: {
    default: {},
  },
}

const endpointPrefixes: Record<string, string> = {
  chatfire: '/v1',
  openai: '/v1',
  openrouter: '/v1',
  minimax: '/anthropic',
  gemini: '/v1beta',
  volcengine: '/api/v3',
  ali: '/api/v1',
  vidu: '/ent/v2',
}

export function listProviderPresets(
  type: SettingsServiceType,
): Array<ProviderPreset & { provider: string }> {
  return Object.entries(providerPresets[type])
    .map(([provider, preset]) => ({ provider, ...preset }))
}

export function stringifySettings(settings: Record<string, unknown> | null | undefined) {
  return JSON.stringify(settings || {}, null, 2)
}

export function getSettingsTemplate(
  type: SettingsServiceType,
  provider = '',
): SettingsTemplate {
  const group = providerSettingsTemplates[type]
  return group[provider] || group.default || {}
}

export function parseSettingsJson(raw: unknown): Record<string, unknown> {
  const text = String(raw || '').trim()
  if (!text) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('高级默认参数必须是 JSON 对象')
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '高级默认参数 JSON 无效')
  }
}

export function mergeVisionSettings(
  type: SettingsServiceType,
  settings: Record<string, unknown>,
  enabled: boolean,
  maxAttempts: unknown,
) {
  if (type !== 'vision') return settings
  const attempts = Number(maxAttempts)
  return {
    ...settings,
    enabled,
    maxAttempts: Number.isFinite(attempts)
      ? Math.min(5, Math.max(1, Math.trunc(attempts)))
      : 2,
  }
}

export function resolveEndpointHint(
  provider: string,
  baseUrl: string,
  type: SettingsServiceType,
) {
  const base = baseUrl || 'https://...'
  if (!provider) return '选择服务商后显示推荐端点前缀'
  if (provider === 'ali' && (type === 'vision' || type === 'text')) {
    return `${base}/compatible-mode/v1`
  }
  return `${base}${endpointPrefixes[provider] || ''}`
}
