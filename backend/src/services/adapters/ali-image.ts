import type {
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
  ImageProviderAdapter,
  ProviderRequest,
} from './types.js'
import { joinProviderUrl } from './url.js'
import {
  isRecord,
  parseJsonStringArray,
  readOutputRecord,
  readStringField,
} from './adapter-utils.js'

type AliImageRequestBody = {
  model: string
  input: {
    messages: Array<{
      role: 'user'
      content: Array<{ text?: string | null; image?: string }>
    }>
  }
  parameters: {
    size: string
    n: number
    negative_prompt: string
    prompt_extend: boolean
    watermark: boolean
    seed?: number
  }
}

function aliImageUrl(result: unknown): string | undefined {
  const output = readOutputRecord(result)
  const choices = Array.isArray(output.choices) ? output.choices : []
  const firstChoice = choices[0]
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) return undefined
  const content = Array.isArray(firstChoice.message.content) ? firstChoice.message.content : []
  const firstContent = content[0]
  return readStringField(firstContent, 'image')
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(item => String(item || '').trim()).filter(Boolean)))
}

function parseReferenceImages(record: ImageGenerationRecord): string[] {
  const normalizedInputs = (record.normalizedSpec?.inputs || [])
    .filter(item => item.type === 'image' && !!item.url)
    .map(item => String(item.url))
  if (normalizedInputs.length) return uniqueStrings(normalizedInputs)

  return uniqueStrings(parseJsonStringArray(record.referenceImages))
}

export class AliImageAdapter implements ImageProviderAdapter {
  readonly provider = 'ali'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com'
    const url = joinProviderUrl(baseUrl, '/api/v1', '/services/aigc/image-generation/generation')
    const size = this.normalizeSize(record.size || '1280*1280')
    const referenceImages = parseReferenceImages(record)
    const body: AliImageRequestBody = {
      model: record.model || 'wan2.6-t2i',
      input: {
        messages: [
          {
            role: 'user',
            content: [
              ...referenceImages.map(image => ({ image })),
              { text: record.prompt },
            ],
          },
        ],
      },
      parameters: {
        size,
        n: 1,
        negative_prompt: '',
        prompt_extend: true,
        watermark: false,
        seed: referenceImages.length ? undefined : Math.floor(Math.random() * 2147483647),
      },
    }

    return {
      url,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body,
    }
  }

  parseGenerateResponse(result: unknown): ImageGenResponse {
    const output = readOutputRecord(result)
    const status = readStringField(output, 'task_status')
    const taskId = readStringField(output, 'task_id')
    if (status === 'PENDING' && taskId) return { isAsync: true, taskId }

    const imageUrl = aliImageUrl(result)
    if (imageUrl) return { isAsync: false, imageUrl }

    throw new Error(`Unexpected Ali image response: ${JSON.stringify(result).slice(0, 200)}`)
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com'
    return {
      url: joinProviderUrl(baseUrl, '/api/v1', `/tasks/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: undefined,
    }
  }

  parsePollResponse(result: unknown): ImagePollResponse {
    const output = readOutputRecord(result)
    const status = readStringField(output, 'task_status')

    if (status === 'SUCCEEDED') {
      return { status: 'completed', imageUrl: aliImageUrl(result) }
    }
    if (status === 'FAILED') {
      return { status: 'failed', error: readStringField(result, 'message') || 'Generation failed' }
    }
    if (status === 'PENDING' || status === 'RUNNING') {
      return { status: 'processing' }
    }
    return { status: 'pending' }
  }

  extractImageBase64(_result: unknown): { data: string; mimeType: string } | null {
    return null
  }

  extractImageUrl(result: unknown): string | null {
    return aliImageUrl(result) || null
  }

  private normalizeSize(size: string): string {
    const [width, height] = size.split('x').map(Number)
    if (width && height) {
      const aspect = width / height
      if (aspect > 1.7) return '1696*960'
      if (aspect < 0.8) return '960*1696'
      return '1280*1280'
    }
    return '1280*1280'
  }
}
