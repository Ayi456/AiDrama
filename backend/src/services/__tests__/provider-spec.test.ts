import assert from 'node:assert/strict'

import {
  buildImageJobSpecFromLegacyRequest,
  buildVideoJobSpecFromLegacyRequest,
  mergeProviderDefaults,
} from '../provider-spec.js'
import { resolveRequestedImageSize } from '../image-size.js'
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

  assert.deepEqual(req.body.image, [
    'https://example.com/look-1.png',
    'https://example.com/look-2.png',
  ])
  assert.equal(req.body.output_format, 'png')
  assert.equal(req.body.watermark, false)
  assert.equal(req.body.sequential_image_generation, 'disabled')
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

  assert.equal(req.body.generate_audio, false)
  assert.equal(req.body.return_last_frame, true)
  assert.equal(req.body.service_tier, 'flex')
  assert.equal(req.body.resolution, '720p')
  assert.equal(req.body.duration, 8)
  assert.deepEqual(
    req.body.content.slice(1).map((item: any) => item.role),
    ['reference_image', 'reference_image'],
  )
})
