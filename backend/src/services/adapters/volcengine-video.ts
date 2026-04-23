/**
 * 火山引擎 Seedance 视频生成 Adapter
 * 端点: /api/v3/contents/generations/tasks (注意 /api/v3 前缀)
 * 响应: { id: "task-xxx" } -> 轮询获取状态
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'
import { joinProviderUrl } from './url.js'

export class VolcEngineVideoAdapter implements VideoProviderAdapter {
  provider = 'volcengine'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'doubao-seedance-1-5-pro-251215'
    const spec = record.normalizedSpec || null
    const volcOptions = this.getVolcengineOptions(spec?.providerOptions)

    const content: any[] = []
    if (spec?.prompt || record.prompt) {
      content.push({ type: 'text', text: spec?.prompt || record.prompt || '' })
    }

    for (const input of spec?.inputs || []) {
      if (input.type === 'image' && input.url) {
        if (input.role === 'first_frame' && spec?.mode !== 'first_last_video') {
          content.push({ type: 'image_url', image_url: { url: input.url } })
          continue
        }
        const role = input.role === 'reference'
          ? 'reference_image'
          : input.role
        content.push({ type: 'image_url', image_url: { url: input.url }, role })
      }
      if (input.type === 'video' && input.url) {
        content.push({ type: 'video_url', video_url: { url: input.url }, role: 'reference_video' })
      }
      if (input.type === 'audio' && input.url) {
        content.push({ type: 'audio_url', audio_url: { url: input.url }, role: 'reference_audio' })
      }
    }

    const body: any = {
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
    if (typeof volcOptions.service_tier === 'string') body.service_tier = volcOptions.service_tier
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

  parseGenerateResponse(result: any): VideoGenResponse {
    if (result.id) {
      return { isAsync: true, taskId: result.id }
    }
    // 同步返回
    const videoUrl = result.video_url || result.content?.video_url || result.data?.video_url
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

  parsePollResponse(result: any): VideoPollResponse {
    const status = result.status
    if (status === 'succeeded') {
      const videoUrl = result.video_url || result.content?.video_url || result.data?.video_url
      return {
        status: 'completed',
        videoUrl,
      }
    }
    if (status === 'failed') {
      return { status: 'failed', error: result.error || 'Video generation failed' }
    }
    return { status: status || 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    return result.video_url || result.content?.video_url || result.data?.video_url || null
  }

  private normalizeDuration(duration?: number | null): number {
    if (duration === -1) return -1
    const parsed = Math.round(Number(duration || 5))
    if (!Number.isFinite(parsed)) return 5
    return Math.min(15, Math.max(4, parsed))
  }

  private getVolcengineOptions(options?: Record<string, Record<string, unknown>>) {
    const raw = options && typeof options === 'object' ? options.volcengine : null
    return raw && typeof raw === 'object' ? raw as Record<string, any> : {}
  }
}
