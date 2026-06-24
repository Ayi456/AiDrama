import type {
  AIConfig,
  ProviderRequest,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
  VideoProviderAdapter,
} from './types.js'
import { joinProviderUrl } from './url.js'
import { readOutputRecord, readStringField } from './adapter-utils.js'

type AliVideoRequestBody = {
  model: string
  input: {
    prompt?: string | null
    img_url: string
    last_img_url?: string
  }
  parameters: {
    resolution: string
    duration: number
    watermark: boolean
    seed: number
  }
}

export class AliVideoAdapter implements VideoProviderAdapter {
  readonly provider = 'ali'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com'
    const body: AliVideoRequestBody = {
      model: record.model || 'wan2.6-i2v-flash',
      input: {
        prompt: record.prompt,
        img_url: record.imageUrl ?? record.firstFrameUrl ?? '',
      },
      parameters: {
        resolution: this.normalizeResolution(record.aspectRatio ?? '16:9'),
        duration: record.duration || 5,
        watermark: false,
        seed: Math.floor(Math.random() * 2147483647),
      },
    }

    if (record.lastFrameUrl) {
      body.input.last_img_url = record.lastFrameUrl
    }

    return {
      url: joinProviderUrl(baseUrl, '/api/v1', '/services/aigc/video-generation/video-synthesis'),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body,
    }
  }

  parseGenerateResponse(result: unknown): VideoGenResponse {
    const output = readOutputRecord(result)
    const status = readStringField(output, 'task_status')
    const taskId = readStringField(output, 'task_id')
    if (status === 'PENDING' && taskId) return { isAsync: true, taskId }

    const videoUrl = readStringField(output, 'video_url')
    if (videoUrl) return { isAsync: false, videoUrl }

    throw new Error(`Unexpected Ali video response: ${JSON.stringify(result).slice(0, 200)}`)
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

  parsePollResponse(result: unknown): VideoPollResponse {
    const output = readOutputRecord(result)
    const status = readStringField(output, 'task_status')

    if (status === 'SUCCEEDED') {
      return { status: 'completed', videoUrl: readStringField(output, 'video_url') }
    }
    if (status === 'FAILED') {
      return { status: 'failed', error: readStringField(result, 'message') || 'Video generation failed' }
    }
    if (status === 'PENDING' || status === 'RUNNING') {
      return { status: 'processing' }
    }
    return { status: 'pending' }
  }

  extractVideoUrl(result: unknown): string | null {
    return readStringField(readOutputRecord(result), 'video_url') || null
  }

  private normalizeResolution(aspectRatio?: string): string {
    if (aspectRatio === '9:16') return '720P'
    if (aspectRatio === '1:1') return '720P'
    return '1080P'
  }
}
