import type {
  ImageGenResponse,
  ImagePollResponse,
  VideoGenResponse,
  VideoPollResponse,
} from './adapters/types.js'

type ImageBase64Payload = {
  data: string
  mimeType: string
}

export type ImageGenerateResultDecision =
  | { type: 'completed-url'; imageUrl: string }
  | { type: 'completed-base64'; data: string; mimeType: string }
  | { type: 'async'; taskId: string }
  | { type: 'missing-output'; message: string }

export type ImagePollResultDecision =
  | { type: 'completed-url'; imageUrl: string }
  | { type: 'completed-base64'; data: string; mimeType: string }
  | { type: 'failed'; error: string }
  | { type: 'continue' }

export type VideoGenerateResultDecision =
  | { type: 'completed-url'; videoUrl: string }
  | { type: 'async'; taskId: string }
  | { type: 'missing-output'; message: string }

export type VideoPollResultDecision =
  | { type: 'completed-url'; videoUrl: string }
  | { type: 'failed'; error: string }
  | { type: 'continue' }

export type ImageGenerateResultInterpreter = {
  parseGenerateResponse: (result: unknown) => ImageGenResponse
  extractImageBase64: (result: unknown) => ImageBase64Payload | null
}

export type ImagePollResultInterpreter = {
  provider: string
  parsePollResponse: (result: unknown) => ImagePollResponse
  extractImageBase64: (result: unknown) => ImageBase64Payload | null
}

export type VideoGenerateResultInterpreter = {
  parseGenerateResponse: (result: unknown) => VideoGenResponse
}

export type VideoPollResultInterpreter = {
  parsePollResponse: (result: unknown) => VideoPollResponse
}

export function interpretImageGenerateResult(
  adapter: ImageGenerateResultInterpreter,
  result: unknown,
): ImageGenerateResultDecision {
  const response = adapter.parseGenerateResponse(result)

  if (!response.isAsync && response.imageUrl) {
    return { type: 'completed-url', imageUrl: response.imageUrl }
  }

  if (!response.isAsync) {
    const base64 = adapter.extractImageBase64(result)
    if (base64) {
      return { type: 'completed-base64', data: base64.data, mimeType: base64.mimeType }
    }
    return { type: 'missing-output', message: 'No image URL or base64 data in response' }
  }

  if (!response.taskId) {
    return { type: 'missing-output', message: 'Async image response did not include taskId' }
  }

  return { type: 'async', taskId: response.taskId }
}

export function interpretImagePollResult(
  adapter: ImagePollResultInterpreter,
  result: unknown,
): ImagePollResultDecision {
  const response = adapter.parsePollResponse(result)

  if (response.status === 'completed' && response.imageUrl) {
    return { type: 'completed-url', imageUrl: response.imageUrl }
  }

  if (response.status === 'completed' && adapter.provider === 'gemini') {
    const base64 = adapter.extractImageBase64(result)
    if (base64) {
      return { type: 'completed-base64', data: base64.data, mimeType: base64.mimeType }
    }
  }

  if (response.status === 'failed') {
    return { type: 'failed', error: response.error || 'Generation failed' }
  }

  return { type: 'continue' }
}

export function interpretVideoGenerateResult(
  adapter: VideoGenerateResultInterpreter,
  result: unknown,
): VideoGenerateResultDecision {
  const response = adapter.parseGenerateResponse(result)

  if (!response.isAsync && response.videoUrl) {
    return { type: 'completed-url', videoUrl: response.videoUrl }
  }

  if (!response.isAsync) {
    return { type: 'missing-output', message: 'No video URL in response' }
  }

  if (!response.taskId) {
    return { type: 'missing-output', message: 'Async video response did not include taskId' }
  }

  return { type: 'async', taskId: response.taskId }
}

export function interpretVideoPollResult(
  adapter: VideoPollResultInterpreter,
  result: unknown,
): VideoPollResultDecision {
  const response = adapter.parsePollResponse(result)

  if (response.status === 'completed' && response.videoUrl) {
    return { type: 'completed-url', videoUrl: response.videoUrl }
  }

  if (response.status === 'failed') {
    return { type: 'failed', error: response.error || 'Video generation failed' }
  }

  return { type: 'continue' }
}
