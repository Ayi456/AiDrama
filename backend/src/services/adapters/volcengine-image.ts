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

export class VolcEngineImageAdapter implements ImageProviderAdapter {
  provider = 'volcengine'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'doubao-seedream-5-0-lite'
    const spec = record.normalizedSpec || null
    const volcOptions = this.getVolcengineOptions(spec?.providerOptions)

    const body: Record<string, unknown> = {
      model,
      prompt: spec?.prompt || record.prompt,
    }

    const imageInputs = (spec?.inputs || [])
      .filter((item) => item.type === 'image' && !!item.url)
      .map((item) => item.url)
    if (imageInputs.length === 1) {
      body.image = imageInputs[0]
    } else if (imageInputs.length > 1) {
      body.image = imageInputs
    }

    const size = spec?.output?.size || record.size || ''
    if (size) {
      body.size = size
    } else if (spec?.output?.width && spec?.output?.height) {
      body.size = `${spec.output.width}x${spec.output.height}`
    }

    if (spec?.control?.watermark != null) body.watermark = spec.control.watermark
    if (typeof spec?.control?.seed === 'number') body.seed = spec.control.seed
    if (typeof spec?.control?.stream === 'boolean') body.stream = spec.control.stream

    if (typeof spec?.output?.format === 'string') body.output_format = spec.output.format
    if (typeof volcOptions.output_format === 'string') body.output_format = volcOptions.output_format
    if (typeof volcOptions.response_format === 'string') body.response_format = volcOptions.response_format
    if (typeof volcOptions.sequential_image_generation === 'string') {
      body.sequential_image_generation = volcOptions.sequential_image_generation
    }
    if (volcOptions.sequential_image_generation_options) {
      body.sequential_image_generation_options = volcOptions.sequential_image_generation_options
    }
    if (volcOptions.optimize_prompt_options) {
      body.optimize_prompt_options = volcOptions.optimize_prompt_options
    }
    if (Array.isArray(volcOptions.tools)) {
      body.tools = volcOptions.tools
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', '/images/generations'),
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
    const imageUrl = this.extractImageUrl(record)
    if (imageUrl) {
      return { isAsync: false, imageUrl }
    }

    const taskId = this.readTaskId(record)
    if (taskId) {
      return { isAsync: true, taskId }
    }

    throw new Error('No image URL in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', `/images/generations/${taskId}`),
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
    if (status === 'succeeded') {
      return {
        status: 'completed',
        imageUrl: this.extractImageUrl(record) || undefined,
      }
    }
    if (status === 'failed') {
      return { status: 'failed', error: this.readString(record.error) || 'Generation failed' }
    }
    if (status === 'pending' || status === 'processing') {
      return { status }
    }
    return { status: 'processing' }
  }

  extractImageUrl(result: unknown): string | null {
    const record = isRecord(result) ? result : {}
    const first = this.firstRecordValue(record.data)
    return this.readString(first?.url) || this.readString(record.url) || null
  }

  extractImageBase64(_result: unknown): { data: string; mimeType: string } | null {
    return null
  }

  private getVolcengineOptions(options?: Record<string, Record<string, unknown>>) {
    const raw = options?.volcengine
    return isRecord(raw) ? raw : {}
  }

  private firstRecordValue(value: unknown): Record<string, unknown> | null {
    if (!Array.isArray(value) || !value.length) return null
    const first = value[0]
    return isRecord(first) ? first : null
  }

  private readTaskId(record: Record<string, unknown>): string | null {
    const taskId = this.readString(record.task_id) || this.readString(record.id)
    return taskId || null
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined
  }
}
