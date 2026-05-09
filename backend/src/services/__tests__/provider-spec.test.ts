import assert from 'node:assert/strict'

import {
  buildImageJobSpecFromLegacyRequest,
  buildVideoJobSpecFromLegacyRequest,
  mergeProviderDefaults,
} from '../provider/provider-spec.js'
import { resolveRequestedImageSize } from '../provider/image-size.js'
import { VolcEngineImageAdapter } from '../adapters/volcengine-image.js'
import { VolcEngineVideoAdapter } from '../adapters/volcengine-video.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

type VolcImageRequestBody = {
  image: string[]
  output_format: string
  watermark: boolean
  sequential_image_generation: string
}

type VolcVideoContentItem = {
  type: string
  role: string
}

type VolcVideoRequestBody = {
  model: string
  generate_audio: boolean
  return_last_frame: boolean
  resolution: string
  duration: number
  content: VolcVideoContentItem[]
  service_tier?: unknown
}

runTest('mergeProviderDefaults deep merges defaults and overrides', () => {
  const merged = mergeProviderDefaults(
    {
      control: { watermark: false, seed: 11 },
      providerOptions: {
        volcengine: { output_format: 'png', resolution: '2K' },
      },
    },
    {
      control: { seed: 22 },
      providerOptions: {
        volcengine: { output_format: 'jpeg' },
      },
    },
  )

  assert.deepEqual(merged, {
    control: { watermark: false, seed: 22 },
    providerOptions: {
      volcengine: { output_format: 'jpeg', resolution: '2K' },
    },
  })
})

runTest('mergeProviderDefaults ignores undefined override branches', () => {
  const merged = mergeProviderDefaults(
    {
      control: {},
      providerOptions: {},
    },
    {
      control: undefined,
      providerOptions: undefined,
    },
  )

  assert.deepEqual(merged, {
    control: {},
    providerOptions: {},
  })
})

runTest('resolveRequestedImageSize falls back to 2K for volcengine', () => {
  assert.equal(resolveRequestedImageSize('volcengine', undefined), '2K')
  assert.equal(resolveRequestedImageSize('volcengine', ''), '2K')
})

runTest('resolveRequestedImageSize preserves explicit size values', () => {
  assert.equal(resolveRequestedImageSize('volcengine', '3072x1728'), '3072x1728')
  assert.equal(resolveRequestedImageSize('openai', '1024x1024'), '1024x1024')
})

runTest('buildImageJobSpecFromLegacyRequest converts reference images into normalized inputs', () => {
  const spec = buildImageJobSpecFromLegacyRequest(
    {
      prompt: 'cinematic portrait',
      size: '1536x1024',
      referenceImages: JSON.stringify([
        'https://example.com/ref-1.png',
        'https://example.com/ref-2.png',
      ]),
    },
    {
      control: { watermark: false },
      providerOptions: {
        volcengine: { output_format: 'png', sequential_image_generation: 'disabled' },
      },
    },
  )

  assert.equal(spec.mode, 'multi_ref_image')
  assert.equal(spec.inputs.length, 2)
  assert.equal(spec.inputs[0]?.type, 'image')
  assert.equal(spec.inputs[0]?.role, 'reference')
  assert.equal(spec.output.width, 1536)
  assert.equal(spec.output.height, 1024)
  assert.equal(spec.control.watermark, false)
  assert.equal(spec.providerOptions.volcengine.output_format, 'png')
})

runTest('buildImageJobSpecFromLegacyRequest tolerates empty provider defaults', () => {
  const spec = buildImageJobSpecFromLegacyRequest(
    {
      prompt: 'wide cinematic temple hall',
      referenceImages: JSON.stringify(['https://example.com/ref-1.png']),
    },
    {},
  )

  assert.equal(spec.mode, 'image_to_image')
  assert.deepEqual(spec.providerOptions, {})
  assert.equal(spec.output.format, undefined)
})

runTest('buildImageJobSpecFromLegacyRequest tolerates null provider defaults branches', () => {
  const spec = buildImageJobSpecFromLegacyRequest(
    {
      prompt: 'wide cinematic temple hall',
    },
    {
      control: null as any,
      providerOptions: null as any,
    },
  )

  assert.deepEqual(spec.control, {
    seed: undefined,
    watermark: undefined,
    stream: undefined,
  })
  assert.deepEqual(spec.providerOptions, {})
})

runTest('buildVideoJobSpecFromLegacyRequest converts first/last frame inputs and defaults', () => {
  const spec = buildVideoJobSpecFromLegacyRequest(
    {
      prompt: 'hero turns toward camera',
      referenceMode: 'first_last',
      firstFrameUrl: 'https://example.com/first.png',
      lastFrameUrl: 'https://example.com/last.png',
      duration: 6,
      aspectRatio: '9:16',
    },
    {
      control: { generateAudio: false, returnLastFrame: true },
      providerOptions: {
        volcengine: { service_tier: 'flex', resolution: '720p' },
      },
    },
  )

  assert.equal(spec.mode, 'first_last_video')
  assert.deepEqual(
    spec.inputs.map((item: { role: string }) => item.role),
    ['first_frame', 'last_frame'],
  )
  assert.equal(spec.output.duration, 6)
  assert.equal(spec.output.ratio, '9:16')
  assert.equal(spec.control.generateAudio, false)
  assert.equal(spec.control.returnLastFrame, true)
  assert.equal(spec.providerOptions.volcengine.service_tier, 'flex')
})

runTest('VolcEngineImageAdapter maps normalized image spec into Seedream image payload', () => {
  const adapter = new VolcEngineImageAdapter()
  const spec = buildImageJobSpecFromLegacyRequest(
    {
      prompt: 'editorial fashion portrait',
      size: '2K',
      referenceImages: JSON.stringify([
        'https://example.com/look-1.png',
        'https://example.com/look-2.png',
      ]),
    },
    {
      control: { watermark: false },
      providerOptions: {
        volcengine: { output_format: 'png', sequential_image_generation: 'disabled' },
      },
    },
  )

  const req = adapter.buildGenerateRequest(
    {
      provider: 'volcengine',
      baseUrl: 'https://ark.cn-beijing.volces.com',
      apiKey: 'test-key',
      model: 'doubao-seedream-5-0-260128',
      settings: {},
    } as any,
    {
      id: 1,
      model: 'doubao-seedream-5-0-260128',
      prompt: spec.prompt,
      normalizedSpec: spec,
    } as any,
  )

  const body = req.body as VolcImageRequestBody
  assert.deepEqual(body.image, [
    'https://example.com/look-1.png',
    'https://example.com/look-2.png',
  ])
  assert.equal(body.output_format, 'png')
  assert.equal(body.watermark, false)
  assert.equal(body.sequential_image_generation, 'disabled')
})

runTest('VolcEngineVideoAdapter maps normalized video spec into Seedance content payload', () => {
  const adapter = new VolcEngineVideoAdapter()
  const spec = buildVideoJobSpecFromLegacyRequest(
    {
      prompt: 'camera pushes in through neon rain',
      referenceMode: 'multiple',
      referenceImageUrls: JSON.stringify([
        'https://example.com/frame-1.png',
        'https://example.com/frame-2.png',
      ]),
      duration: 8,
      aspectRatio: '16:9',
    },
    {
      control: { generateAudio: false, returnLastFrame: true, watermark: false },
      providerOptions: {
        volcengine: { service_tier: 'flex', resolution: '720p', draft: false },
      },
    },
  )

  const req = adapter.buildGenerateRequest(
    {
      provider: 'volcengine',
      baseUrl: 'https://ark.cn-beijing.volces.com',
      apiKey: 'test-key',
      model: 'doubao-seedance-2-0-260128',
      settings: {},
    } as any,
    {
      id: 2,
      model: 'doubao-seedance-2-0-260128',
      prompt: spec.prompt,
      normalizedSpec: spec,
    } as any,
  )

  const body = req.body as VolcVideoRequestBody
  assert.equal(body.generate_audio, false)
  assert.equal(body.return_last_frame, true)
  assert.equal('service_tier' in body, false)
  assert.equal(body.resolution, '720p')
  assert.equal(body.duration, 8)
  assert.deepEqual(
    body.content.slice(1).map(item => item.role),
    ['reference_image', 'reference_image'],
  )
})

runTest('VolcEngineVideoAdapter maps Seedance multimodal image, video and audio references', () => {
  const adapter = new VolcEngineVideoAdapter()
  const spec = buildVideoJobSpecFromLegacyRequest(
    {
      prompt: 'use the video pacing and keep the product shape from the image',
      referenceMode: 'multimodal',
      referenceImageUrls: JSON.stringify([
        'https://example.com/ref-image-1.png',
        'https://example.com/ref-image-2.png',
      ]),
      referenceVideoUrls: JSON.stringify([
        'https://example.com/ref-video-1.mp4',
      ]),
      referenceAudioUrls: JSON.stringify([
        'https://example.com/ref-audio-1.mp3',
      ]),
      duration: 11,
      aspectRatio: '16:9',
    },
    {
      control: { generateAudio: true, watermark: false },
    },
  )

  assert.equal(spec.mode, 'multi_modal_video')
  assert.deepEqual(
    spec.inputs.map((item: { type: string; role: string }) => [item.type, item.role]),
    [
      ['image', 'reference'],
      ['image', 'reference'],
      ['video', 'reference_video'],
      ['audio', 'reference_audio'],
    ],
  )

  const req = adapter.buildGenerateRequest(
    {
      provider: 'volcengine',
      baseUrl: 'https://ark.cn-beijing.volces.com',
      apiKey: 'test-key',
      model: 'doubao-seedance-2-0-260128',
      settings: {},
    } as any,
    {
      id: 4,
      model: 'doubao-seedance-2-0-260128',
      prompt: spec.prompt,
      normalizedSpec: spec,
    } as any,
  )

  const body = req.body as VolcVideoRequestBody
  assert.deepEqual(
    body.content.slice(1).map(item => [item.type, item.role]),
    [
      ['image_url', 'reference_image'],
      ['image_url', 'reference_image'],
      ['video_url', 'reference_video'],
      ['audio_url', 'reference_audio'],
    ],
  )
  assert.equal(body.generate_audio, true)
  assert.equal(body.duration, 11)
})

runTest('buildVideoJobSpecFromLegacyRequest rejects audio-only multimodal references', () => {
  assert.throws(
    () => buildVideoJobSpecFromLegacyRequest({
      prompt: 'use this background music',
      referenceMode: 'multimodal',
      referenceAudioUrls: JSON.stringify(['https://example.com/ref-audio-1.mp3']),
    }),
    /at least one reference image or video/i,
  )
})

runTest('VolcEngineVideoAdapter does not pass service_tier through to Seedance video payload', () => {
  const adapter = new VolcEngineVideoAdapter()
  const spec = buildVideoJobSpecFromLegacyRequest(
    {
      prompt: 'camera crosses an empty hall',
      referenceMode: 'first_last',
      firstFrameUrl: 'https://example.com/first.png',
      lastFrameUrl: 'https://example.com/last.png',
      duration: 10,
      aspectRatio: '16:9',
    },
    {
      control: { generateAudio: true, returnLastFrame: false, watermark: false },
      providerOptions: {
        volcengine: { service_tier: 'default', resolution: '720p', draft: false },
      },
    },
  )

  const req = adapter.buildGenerateRequest(
    {
      provider: 'volcengine',
      baseUrl: 'https://ark.cn-beijing.volces.com',
      apiKey: 'test-key',
      model: 'doubao-seedance-2-0-260128',
      settings: {},
    } as any,
    {
      id: 3,
      model: 'doubao-seedance-2-0-260128',
      prompt: spec.prompt,
      normalizedSpec: spec,
    } as any,
  )

  const body = req.body as VolcVideoRequestBody
  assert.equal(body.model, 'doubao-seedance-2-0-260128')
  assert.equal('service_tier' in body, false)
  assert.deepEqual(
    body.content.slice(1).map(item => item.role),
    ['first_frame', 'last_frame'],
  )
})
