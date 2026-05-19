import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types.js'
import { joinProviderUrl } from './url.js'
import { isRecord, parseJsonStringArray } from './adapter-utils.js'

export class MiniMaxVideoAdapter implements VideoProviderAdapter {
  provider = 'minimax'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    let promptText = record.prompt || ''
    promptText += `  --ratio ${record.aspectRatio || '16:9'}  --dur ${record.duration || 5}`

    const content: Array<Record<string, unknown>> = [{ type: 'text', text: promptText }]

    if (record.referenceMode === 'single' && record.imageUrl) {
      content.push({ type: 'image_url', image_url: { url: record.imageUrl }, role: 'reference_image' })
    } else if (record.referenceMode === 'first_last') {
      if (record.firstFrameUrl) {
        content.push({ type: 'image_url', image_url: { url: record.firstFrameUrl }, role: 'first_frame' })
      }
      if (record.lastFrameUrl) {
        content.push({ type: 'image_url', image_url: { url: record.lastFrameUrl }, role: 'last_frame' })
      }
    } else if (record.referenceMode === 'multiple' && record.referenceImageUrls) {
      for (const url of parseJsonStringArray(record.referenceImageUrls)) {
        content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
      }
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/video_generation'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: { model: record.model || config.model, content },
    }
  }

  parseGenerateResponse(result: unknown): VideoGenResponse {
    const record = isRecord(result) ? result : {}
    const taskId = this.readTaskId(record)
    if (!taskId) {
      const videoUrl = this.extractVideoUrl(record)
      if (videoUrl) {
        return { isAsync: false, videoUrl }
      }
      throw new Error('No task_id or video_url in response')
    }
    return { isAsync: true, taskId }
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/video_generation/task/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: unknown): VideoPollResponse {
    const record = isRecord(result) ? result : {}
    const status = typeof record.status === 'string'
      ? record.status
      : typeof record.state === 'string'
        ? record.state
        : typeof record.data === 'object' && isRecord(record.data)
          ? this.readString(record.data.status)
          : undefined

    if (status === 'completed' || status === 'succeeded') {
      return {
        status: 'completed',
        videoUrl: this.extractVideoUrl(record) || undefined,
      }
    }
    if (status === 'failed' || status === 'error') {
      return { status: 'failed', error: this.readString(record.error_msg) || this.readString(record.error) || 'Video generation failed' }
    }
    if (status === 'pending' || status === 'processing') {
      return { status }
    }
    return { status: 'processing' }
  }

  extractVideoUrl(result: unknown): string | null {
    const record = isRecord(result) ? result : {}
    const data = isRecord(record.data) ? record.data : null
    const content = isRecord(record.content) ? record.content : null
    return this.readString(record.video_url)
      || this.readString(data?.video_url)
      || this.readString(content?.video_url)
      || null
  }

  private readTaskId(record: Record<string, unknown>): string | null {
    const id = this.readString(record.task_id) || this.readString(record.id) || this.readString(isRecord(record.data) ? record.data.id : undefined)
    return id || null
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined
  }
}
