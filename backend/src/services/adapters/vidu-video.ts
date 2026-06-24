import type {
  AIConfig,
  ProviderRequest,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
  VideoProviderAdapter,
} from './types.js'
import { joinProviderUrl } from './url.js'
import { parseJsonStringArray, readStringField } from './adapter-utils.js'

type ViduGenerateRequestBody = {
  model: string
  images: string[]
  prompt?: string | null
  duration?: number
  resolution?: string
}

type ViduCallbackState = {
  status: 'completed' | 'failed'
  videoUrl?: string
  error?: string
}

export class ViduVideoAdapter implements VideoProviderAdapter {
  provider = 'vidu'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'viduq3-turbo'
    const body: ViduGenerateRequestBody = {
      model,
      images: [],
      prompt: record.prompt,
    }

    if (record.referenceMode === 'single' && record.imageUrl) {
      body.images.push(record.imageUrl)
    } else if (record.referenceMode === 'first_last') {
      if (record.firstFrameUrl) body.images.push(record.firstFrameUrl)
      if (record.lastFrameUrl) body.images.push(record.lastFrameUrl)
    } else if (record.referenceMode === 'multiple') {
      body.images.push(...parseJsonStringArray(record.referenceImageUrls))
    }

    if (record.duration) body.duration = record.duration
    if (record.aspectRatio) {
      const resolutionByRatio: Record<string, string> = {
        '16:9': '720p',
        '9:16': '720p',
        '1:1': '720p',
      }
      body.resolution = resolutionByRatio[record.aspectRatio] || '720p'
    }

    return {
      url: joinProviderUrl(config.baseUrl, '', '/ent/v2/img2video'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: unknown): VideoGenResponse {
    const taskId = readStringField(result, 'task_id')
    if (taskId) return { isAsync: true, taskId }

    const videoUrl = readStringField(result, 'video_url')
    if (videoUrl) return { isAsync: false, videoUrl }

    throw new Error('No task_id in Vidu response')
  }

  buildPollRequest(_config: AIConfig, _taskId: string): ProviderRequest {
    return {
      url: 'vidu://no-polling-endpoint',
      method: 'GET',
      headers: {},
      body: undefined,
    }
  }

  parsePollResponse(_result: unknown): VideoPollResponse {
    return { status: 'processing' }
  }

  extractVideoUrl(result: unknown): string | null {
    return readStringField(result, 'video_url') || null
  }

  static parseCallbackState(body: unknown): ViduCallbackState {
    const state = readStringField(body, 'state')
    if (state === 'success') {
      return { status: 'completed', videoUrl: readStringField(body, 'video_url') }
    }
    if (state === 'failed') {
      return { status: 'failed', error: readStringField(body, 'error') || 'Vidu generation failed' }
    }
    return { status: 'failed', error: `Unknown state: ${state}` }
  }
}
