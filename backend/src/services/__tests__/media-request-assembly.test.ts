import assert from 'node:assert/strict'

import {
  assembleImageGenerateRequest,
  assembleVideoGenerateRequest,
} from '../media-request-assembly.js'
import type {
  AIConfig,
  ImageGenResponse,
  ImagePollResponse,
  ImageProviderAdapter,
  ProviderRequest,
  VideoGenResponse,
  VideoPollResponse,
  VideoProviderAdapter,
} from '../adapters/types.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

function unsupported(name: string): never {
  throw new Error(`${name} is not used in request assembly tests`)
}

const config: AIConfig = {
  provider: 'test-provider',
  baseUrl: 'https://provider.example.com',
  apiKey: 'test-key',
  model: 'test-model',
  settings: {
    control: {
      watermark: false,
      generateAudio: false,
    },
    providerOptions: {
      volcengine: {
        output_format: 'png',
        resolution: '720p',
      },
    },
  },
}

runTest('assembleImageGenerateRequest builds normalized image specs from resolved references', () => {
  const adapter: ImageProviderAdapter = {
    provider: 'test-provider',
    buildGenerateRequest: (_config, record): ProviderRequest => ({
      url: 'https://provider.example.com/images',
      method: 'POST',
      headers: { Authorization: 'Bearer test-key' },
      body: {
        mode: record.normalizedSpec?.mode,
        prompt: record.prompt,
        referenceImages: JSON.parse(record.referenceImages || '[]'),
        outputFormat: record.normalizedSpec?.output.format,
        watermark: record.normalizedSpec?.control.watermark,
      },
    }),
    parseGenerateResponse: (): ImageGenResponse => unsupported('parseGenerateResponse'),
    buildPollRequest: (): ProviderRequest => unsupported('buildPollRequest'),
    parsePollResponse: (): ImagePollResponse => unsupported('parsePollResponse'),
    extractImageUrl: (): string | null => unsupported('extractImageUrl'),
    extractImageBase64: (): { data: string; mimeType: string } | null => unsupported('extractImageBase64'),
  }

  const assembled = assembleImageGenerateRequest({
    adapter,
    config,
    record: {
      id: 11,
      model: 'image-model',
      prompt: 'cinematic portrait',
      size: '1536x1024',
      frameType: 'first_frame',
    },
    resolvedReferenceImages: [
      'https://cdn.example.com/ref-a.png',
      'https://cdn.example.com/ref-b.png',
    ],
  })

  assert.equal(assembled.normalizedSpec.mode, 'multi_ref_image')
  assert.equal(assembled.normalizedSpec.context.frameType, 'first_frame')
  assert.deepEqual(assembled.providerRequest.body.referenceImages, [
    'https://cdn.example.com/ref-a.png',
    'https://cdn.example.com/ref-b.png',
  ])
  assert.equal(assembled.providerRequest.body.outputFormat, 'png')
  assert.equal(assembled.providerRequest.body.watermark, false)
})

runTest('assembleVideoGenerateRequest builds provider requests from resolved multimodal references', () => {
  const adapter: VideoProviderAdapter = {
    provider: 'test-provider',
    buildGenerateRequest: (_config, record): ProviderRequest => ({
      url: 'https://provider.example.com/videos',
      method: 'POST',
      headers: { Authorization: 'Bearer test-key' },
      body: {
        mode: record.normalizedSpec?.mode,
        inputs: record.normalizedSpec?.inputs.map(input => [input.type, input.role, input.url]),
        referenceImages: JSON.parse(record.referenceImageUrls || '[]'),
        referenceVideos: JSON.parse(record.referenceVideoUrls || '[]'),
        referenceAudios: JSON.parse(record.referenceAudioUrls || '[]'),
        resolution: record.normalizedSpec?.output.resolution,
        generateAudio: record.normalizedSpec?.control.generateAudio,
      },
    }),
    parseGenerateResponse: (): VideoGenResponse => unsupported('parseGenerateResponse'),
    buildPollRequest: (): ProviderRequest => unsupported('buildPollRequest'),
    parsePollResponse: (): VideoPollResponse => unsupported('parsePollResponse'),
    extractVideoUrl: (): string | null => unsupported('extractVideoUrl'),
  }

  const assembled = assembleVideoGenerateRequest({
    adapter,
    config,
    record: {
      id: 12,
      model: 'video-model',
      prompt: 'camera crosses a neon street',
      referenceMode: 'multimodal',
      duration: 8,
      aspectRatio: '16:9',
    },
    resolvedReferences: {
      imageUrl: 'https://cdn.example.com/hero.png',
      firstFrameUrl: 'https://cdn.example.com/first.png',
      lastFrameUrl: null,
      referenceImageUrls: ['https://cdn.example.com/style.png'],
      referenceVideoUrls: ['https://cdn.example.com/motion.mp4'],
      referenceAudioUrls: ['https://cdn.example.com/music.mp3'],
    },
  })

  assert.equal(assembled.normalizedSpec.mode, 'multi_modal_video')
  assert.deepEqual(assembled.providerRequest.body.referenceImages, ['https://cdn.example.com/style.png'])
  assert.deepEqual(assembled.providerRequest.body.referenceVideos, ['https://cdn.example.com/motion.mp4'])
  assert.deepEqual(assembled.providerRequest.body.referenceAudios, ['https://cdn.example.com/music.mp3'])
  assert.deepEqual(assembled.providerRequest.body.inputs, [
    ['image', 'reference', 'https://cdn.example.com/hero.png'],
    ['image', 'reference', 'https://cdn.example.com/first.png'],
    ['image', 'reference', 'https://cdn.example.com/style.png'],
    ['video', 'reference_video', 'https://cdn.example.com/motion.mp4'],
    ['audio', 'reference_audio', 'https://cdn.example.com/music.mp3'],
  ])
  assert.equal(assembled.providerRequest.body.resolution, '720p')
  assert.equal(assembled.providerRequest.body.generateAudio, false)
})
