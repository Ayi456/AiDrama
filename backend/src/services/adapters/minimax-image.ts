import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types.js'
import { joinProviderUrl } from './url.js'
import { isRecord, parseJsonStringArray } from './adapter-utils.js'

export class MiniMaxImageAdapter implements ImageProviderAdapter {
  provider = 'minimax'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const body: Record<string, unknown> = {
      model: record.model || config.model,
      prompt: record.prompt,
      size: record.size || '1920x1080',
      n: 1,
    }

    const refs = parseJsonStringArray(record.referenceImages)
    if (refs.length > 0) {
      body.image = refs
    }

    if (record.size) {
      const [w, h] = record.size.split('x')
      if (w && h) {
        body.aspect_ratio = `${w}/${h}`
      }
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/image_generation'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: unknown): ImageGenResponse {
    const record = isRecord(result) ? result : {}
    const taskId = this.readTaskId(record)
    if (taskId) {
      return { isAsync: true, taskId }
    }

    const imageUrl = this.extractImageUrl(record)
    if (imageUrl) {
      return { isAsync: false, imageUrl }
    }

    throw new Error('No image URL or task_id in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/image_generation/task/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: unknown): ImagePollResponse {
    const record = isRecord(result) ? result : {}
    const status = typeof record.status === 'string' ? record.status : typeof record.state === 'string' ? record.state : undefined
    if (status === 'completed' || status === 'succeeded') {
      return {
        status: 'completed',
        imageUrl: this.extractImageUrl(record) || undefined,
      }
    }
    if (status === 'failed' || status === 'error') {
      return { status: 'failed', error: this.readString(record.error_msg) || this.readString(record.error) || 'Generation failed' }
    }
    if (status === 'pending' || status === 'processing') {
      return { status }
    }
    return { status: 'processing' }
  }

  extractImageUrl(result: unknown): string | null {
    const record = isRecord(result) ? result : {}
    const data = this.firstRecordValue(record.data)
    return this.readString(data?.url) || this.readString(record.image_url) || this.readString(record.url) || null
  }

  extractImageBase64(_result: unknown): { data: string; mimeType: string } | null {
    return null
  }

  private firstRecordValue(value: unknown): Record<string, unknown> | null {
    if (!Array.isArray(value) || !value.length) return null
    const first = value[0]
    return isRecord(first) ? first : null
  }

  private readTaskId(record: Record<string, unknown>): string | null {
    const id = this.readString(record.task_id) || this.readString(record.id)
    return id || null
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined
  }
}
