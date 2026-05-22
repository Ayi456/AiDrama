import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types.js'
import { joinProviderUrl } from './url.js'
import { isRecord } from './adapter-utils.js'

export class VolcEngineVideoAdapter implements VideoProviderAdapter {
  provider = 'volcengine'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'doubao-seedance-1-5-pro-251215'
    const spec = record.normalizedSpec || null
    const volcOptions = this.getVolcengineOptions(spec?.providerOptions)

    const content: Array<Record<string, unknown>> = []
    if (spec?.prompt || record.prompt) {
      content.push({ type: 'text', text: spec?.prompt || record.prompt || '' })
    }

    for (const input of spec?.inputs || []) {
      if (input.type === 'image' && input.url) {
        if (input.role === 'first_frame' && spec?.mode !== 'first_last_video') {
          content.push({ type: 'image_url', image_url: { url: input.url } })
          continue
        }
        const role = input.role === 'reference' ? 'reference_image' : input.role
        content.push({ type: 'image_url', image_url: { url: input.url }, role })
      }
      if (input.type === 'video' && input.url) {
        content.push({ type: 'video_url', video_url: { url: input.url }, role: 'reference_video' })
      }
      if (input.type === 'audio' && input.url) {
        content.push({ type: 'audio_url', audio_url: { url: input.url }, role: 'reference_audio' })
      }
    }

    const body: Record<string, unknown> = {
      model,
      content,
      generate_audio: spec?.control?.generateAudio ?? true,
      ratio: spec?.output?.ratio || record.aspectRatio || 'adaptive',
      duration: this.normalizeDuration(spec?.output?.duration ?? record.duration),
      watermark: spec?.control?.watermark ?? false,
    }
    if (typeof spec?.control?.seed === 'number') body.seed = spec.control.seed
    if (typeof spec?.control?.returnLastFrame === 'boolean') body.return_last_frame = spec.control.returnLastFrame
    if (typeof spec?.output?.resolution === 'string') body.resolution = spec.output.resolution
    if (typeof volcOptions.resolution === 'string') body.resolution = volcOptions.resolution
    if (typeof volcOptions.execution_expires_after === 'number') body.execution_expires_after = volcOptions.execution_expires_after
    if (typeof volcOptions.draft === 'boolean') body.draft = volcOptions.draft
    if (typeof volcOptions.safety_identifier === 'string') body.safety_identifier = volcOptions.safety_identifier
    if (Array.isArray(volcOptions.tools)) body.tools = volcOptions.tools

    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', '/contents/generations/tasks'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: unknown): VideoGenResponse {
    const record = isRecord(result) ? result : {}
    const taskId = this.readTaskId(record)
    if (taskId) {
      return { isAsync: true, taskId }
    }

    const videoUrl = this.extractVideoUrl(record)
    if (videoUrl) {
      return { isAsync: false, videoUrl }
    }

    throw new Error('No task_id or video_url in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', `/contents/generations/tasks/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: unknown): VideoPollResponse {
    const record = isRecord(result) ? result : {}
    const status = typeof record.status === 'string' ? record.status : undefined
    if (status === 'succeeded') {
      return {
        status: 'completed',
        videoUrl: this.extractVideoUrl(record) || undefined,
      }
    }
    if (status === 'failed') {
      return { status: 'failed', error: this.readErrorMessage(record.error) || 'Video generation failed' }
    }
    if (status === 'pending' || status === 'processing') {
      return { status }
    }
    return { status: 'processing' }
  }

  extractVideoUrl(result: unknown): string | null {
    const record = isRecord(result) ? result : {}
    const content = isRecord(record.content) ? record.content : null
    const data = isRecord(record.data) ? record.data : null
    return this.readString(record.video_url)
      || this.readString(content?.video_url)
      || this.readString(data?.video_url)
      || null
  }

  private normalizeDuration(duration?: number | null): number {
    if (duration === -1) return -1
    const parsed = Math.round(Number(duration || 5))
    if (!Number.isFinite(parsed)) return 5
    return Math.min(15, Math.max(4, parsed))
  }

  private getVolcengineOptions(options?: Record<string, Record<string, unknown>>) {
    const raw = options?.volcengine
    return isRecord(raw) ? raw : {}
  }

  private readTaskId(record: Record<string, unknown>): string | null {
    const id = this.readString(record.id) || this.readString(record.task_id)
    return id || null
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : undefined
  }

  private readErrorMessage(value: unknown): string | undefined {
    const direct = this.readString(value)
    if (direct) return direct
    if (!isRecord(value)) return undefined
    const message = this.readString(value.message)
    const code = this.readString(value.code)
    if (message && code) return `[${code}] ${message}`
    return message || code
  }
}
