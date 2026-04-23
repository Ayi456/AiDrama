/**
 * 火山引擎 veImageX 图片生成 Adapter
 * 端点: /api/v3/images/generations (注意 /api/v3 前缀)
 * 响应格式: { data: [{ url: "..." }] }
 */
import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types'
import { joinProviderUrl } from './url.js'

export class VolcEngineImageAdapter implements ImageProviderAdapter {
  provider = 'volcengine'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'doubao-seedream-5-0-lite'
    const spec = record.normalizedSpec || null
    const volcOptions = this.getVolcengineOptions(spec?.providerOptions)

    const body: any = {
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

  parseGenerateResponse(result: any): ImageGenResponse {
    const imageUrl = result.data?.[0]?.url || result.url
    if (imageUrl) {
      return { isAsync: false, imageUrl }
    }
    if (result.task_id || result.id) {
      return { isAsync: true, taskId: result.task_id || result.id }
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

  parsePollResponse(result: any): ImagePollResponse {
    const status = result.status
    if (status === 'succeeded') {
      return {
        status: 'completed',
        imageUrl: result.data?.[0]?.url || result.image_url,
      }
    }
    if (status === 'failed') {
      return { status: 'failed', error: result.error || 'Generation failed' }
    }
    return { status: status || 'processing' }
  }

  extractImageUrl(result: any): string | null {
    return result.data?.[0]?.url || result.image_url || null
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    return null
  }

  private getVolcengineOptions(options?: Record<string, Record<string, unknown>>) {
    const raw = options && typeof options === 'object' ? options.volcengine : null
    return raw && typeof raw === 'object' ? raw as Record<string, any> : {}
  }
}
