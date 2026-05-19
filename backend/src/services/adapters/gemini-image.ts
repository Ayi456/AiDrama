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
import { parseDataUrl } from '../../utils/storage.js'

export class GeminiImageAdapter implements ImageProviderAdapter {
  provider = 'gemini'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const modelName = record.model || config.model || 'gemini-2.5-flash-image'
    const model = modelName.startsWith('models/') ? modelName : `models/${modelName}`

    const parts: Array<Record<string, unknown>> = []
    for (const ref of parseJsonStringArray(record.referenceImages)) {
      const parsed = parseDataUrl(ref)
      if (parsed) {
        parts.push({
          inline_data: {
            mime_type: parsed.mimeType,
            data: parsed.data,
          },
        })
      }
    }
    parts.push({ text: record.prompt || 'Generate an image' })

    const body = {
      contents: [{
        parts,
      }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          aspectRatio: this.parseAspectRatio(record.size),
          imageSize: this.parseImageSize(record.size),
        },
      },
    }

    const url = new URL(joinProviderUrl(config.baseUrl, '/v1beta', `/${model}:generateContent`))
    url.searchParams.set('key', config.apiKey)

    return {
      url: url.toString(),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: unknown): ImageGenResponse {
    const record = isRecord(result) ? result : {}
    const firstCandidate = this.firstRecordValue(record.candidates)
    const finishReason = this.readString(firstCandidate?.finishReason) || this.readString(firstCandidate?.finish_reason)
    const finishMessage = this.readString(firstCandidate?.finishMessage) || this.readString(firstCandidate?.finish_message)

    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
      throw new Error(finishMessage || `Gemini generation stopped: ${finishReason}`)
    }

    const imageUrl = this.extractImageUrl(record)
    if (imageUrl) {
      return { isAsync: false, imageUrl }
    }

    if (this.extractImageBase64(record)) {
      return { isAsync: false, imageUrl: undefined }
    }

    const taskId = this.readTaskId(record)
    if (taskId) {
      return { isAsync: true, taskId }
    }

    if (isRecord(record.error)) {
      throw new Error(this.readString(record.error.message) || 'Gemini generation failed')
    }
    throw new Error('No image data in Gemini response')
  }

  parsePollResponse(_result: unknown): ImagePollResponse {
    return { status: 'completed' }
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    const url = new URL(joinProviderUrl(config.baseUrl, '/v1beta', `/${taskId}`))
    url.searchParams.set('key', config.apiKey)
    return {
      url: url.toString(),
      method: 'GET',
      headers: {
        'x-goog-api-key': config.apiKey,
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  extractImageUrl(result: unknown): string | null {
    const record = isRecord(result) ? result : {}
    const data = this.firstRecordValue(record.data)
    return this.readString(data?.url) || this.readString(record.image_url) || this.readString(record.url) || null
  }

  extractImageBase64(result: unknown): { data: string; mimeType: string } | null {
    const record = isRecord(result) ? result : {}
    const data = this.firstRecordValue(record.data)
    const dataUrl = this.readString(data?.b64_json)
    if (dataUrl) {
      return { data: dataUrl, mimeType: 'image/png' }
    }

    const firstCandidate = this.firstRecordValue(record.candidates)
    let candidateContent: Record<string, unknown> | null = null
    if (firstCandidate && isRecord(firstCandidate.content)) {
      candidateContent = firstCandidate.content
    }

    const parts = this.readArray(candidateContent?.parts)
    for (const part of parts) {
      if (!isRecord(part)) continue
      const inline = isRecord(part.inlineData)
        ? part.inlineData
        : isRecord(part.inline_data)
          ? part.inline_data
          : null
      if (!inline) continue
      return {
        data: this.readString(inline.data) || '',
        mimeType: this.readString(inline.mimeType) || this.readString(inline.mime_type) || 'image/png',
      }
    }
    return null
  }

  private firstRecordValue(value: unknown): Record<string, unknown> | null {
    if (!Array.isArray(value) || !value.length) return null
    const first = value[0]
    return isRecord(first) ? first : null
  }

  private readArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : []
  }

  private readTaskId(record: Record<string, unknown>): string | null {
    const id = this.readString(record.task_id) || this.readString(record.id)
    return id || null
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined
  }

  private parseAspectRatio(size?: string | null): string {
    if (!size) return '16:9'
    const [w, h] = size.split('x').map(Number)
    if (!w || !h) return '16:9'
    const gcd = this.gcd(w, h)
    return `${w / gcd}:${h / gcd}`
  }

  private parseImageSize(size?: string | null): string {
    if (!size) return '1K'
    const [w] = size.split('x').map(Number)
    if (!w) return '1K'
    if (w >= 2048) return '4K'
    if (w >= 1024) return '2K'
    if (w >= 512) return '1K'
    return '512'
  }

  private gcd(a: number, b: number): number {
    return b === 0 ? a : this.gcd(b, a % b)
  }
}
