import type { ImageJobSpec, VideoJobSpec } from '../provider/provider-spec.js'

export interface ImageProviderAdapter {
  provider: string

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest

  parseGenerateResponse(result: unknown): ImageGenResponse

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest

  parsePollResponse(result: unknown): ImagePollResponse

  extractImageUrl(result: unknown): string | null

  extractImageBase64(result: unknown): { data: string; mimeType: string } | null
}

export interface VideoProviderAdapter {
  provider: string

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest

  parseGenerateResponse(result: unknown): VideoGenResponse

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest

  parsePollResponse(result: unknown): VideoPollResponse

  extractVideoUrl(result: unknown): string | null
}

export interface ProviderRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

export interface AIConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
  settings?: Record<string, unknown>
}

export interface ImageGenerationRecord {
  id: number
  model?: string | null
  prompt?: string | null
  size?: string | null
  frameType?: string | null
  referenceImages?: string | null
  normalizedSpec?: ImageJobSpec | null
}

export interface VideoGenerationRecord {
  id: number
  model?: string | null
  prompt?: string | null
  referenceMode?: string | null
  imageUrl?: string | null
  firstFrameUrl?: string | null
  lastFrameUrl?: string | null
  referenceImageUrls?: string | null
  referenceVideoUrls?: string | null
  referenceAudioUrls?: string | null
  duration?: number | null
  aspectRatio?: string | null
  normalizedSpec?: VideoJobSpec | null
}

export interface ImageGenResponse {
  isAsync: boolean
  taskId?: string
  imageUrl?: string
}

export interface ImagePollResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  imageUrl?: string
  error?: string
}

export interface VideoGenResponse {
  isAsync: boolean
  taskId?: string
  videoUrl?: string
}

export interface VideoPollResponse {
  status: 'pending' | 'processing' | 'completed' | 'failed'
  videoUrl?: string
  error?: string
}
