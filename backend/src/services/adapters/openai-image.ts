import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types.js'
import { joinProviderUrl } from './url.js'
import { isRecord } from './adapter-utils.js'

export class OpenAIImageAdapter implements ImageProviderAdapter {
  provider = 'openai'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const body: Record<string, unknown> = {
      model: record.model || 'dall-e-3',
      prompt: record.prompt,
      size: record.size || '1024x1024',
      n: 1,
      response_format: 'url',
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/images/generations'),
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

    if (this.extractImageBase64(record)) {
      return { isAsync: false, imageUrl: undefined }
    }

    throw new Error('No image URL in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/images/task/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: unknown): ImagePollResponse {
    const record = isRecord(result) ? result : {}
    const status = typeof record.status === 'string' ? record.status : undefined
    if (status === 'completed') {
      return {
        status: 'completed',
        imageUrl: this.extractImageUrl(record) || undefined,
      }
    }
    if (status === 'failed') {
      const error = isRecord(record.error) ? record.error : null
      return { status: 'failed', error: this.readString(error?.message) || 'Generation failed' }
    }
    if (status === 'pending' || status === 'processing') {
      return { status }
    }
    return { status: 'processing' }
  }

  extractImageUrl(result: unknown): string | null {
    const record = isRecord(result) ? result : {}
    const data = this.firstRecordValue(record.data)
    return this.readString(data?.url) || this.readString(record.image_url) || null
  }

  extractImageBase64(result: unknown): { data: string; mimeType: string } | null {
    const record = isRecord(result) ? result : {}
    const data = this.firstRecordValue(record.data)
    const b64 = this.readString(data?.b64_json)
    if (b64) {
      return { data: b64, mimeType: 'image/png' }
    }
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
