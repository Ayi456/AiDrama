import assert from 'node:assert/strict'

import {
  buildAiConfigCreateValues,
  buildAiConfigProbePayload,
  buildAiConfigPublicPayload,
  buildAiConfigUpdatePatch,
  errorMessageFromUnknown,
  validateAiConfigCreateBody,
  validateAiConfigProbeBody,
} from '../ai-config-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('validateAiConfigCreateBody preserves required service and provider checks', () => {
  assert.equal(validateAiConfigCreateBody({}), 'service_type and provider are required')
  assert.equal(validateAiConfigCreateBody({ service_type: 'audio', provider: 'x' }), 'service_type must be one of text, image, video or vision')
  assert.equal(validateAiConfigCreateBody({ service_type: 'image', provider: 'ali' }), null)
})

runTest('buildAiConfigCreateValues maps route body into config insert values', () => {
  const values = buildAiConfigCreateValues(
    {
      service_type: 'image',
      provider: 'ali',
      base_url: 'https://dashscope.aliyuncs.com',
      api_key: 'secret',
      model: ['wanx2.1-t2i-turbo'],
      settings: { size: '1024*1024' },
      priority: 3,
    },
    '2026-05-08T00:00:00.000Z',
  )

  assert.deepEqual(values, {
    serviceType: 'image',
    provider: 'ali',
    name: 'ali-image',
    baseUrl: 'https://dashscope.aliyuncs.com',
    apiKey: 'secret',
    model: '["wanx2.1-t2i-turbo"]',
    settings: '{"size":"1024*1024"}',
    priority: 3,
    isActive: true,
    createdAt: '2026-05-08T00:00:00.000Z',
    updatedAt: '2026-05-08T00:00:00.000Z',
  })
})

runTest('buildAiConfigPublicPayload redacts stored API keys from route responses', () => {
  const payload = buildAiConfigPublicPayload({
    id: 1,
    serviceType: 'image',
    provider: 'volcengine',
    name: 'image provider',
    baseUrl: 'https://ark.cn-beijing.volces.com',
    apiKey: 'secret-key',
    model: '["seedream-5-0"]',
    settings: '{"size":"2K"}',
    priority: 3,
    isActive: true,
    createdAt: '2026-05-08T00:00:00.000Z',
    updatedAt: '2026-05-08T00:01:00.000Z',
  })

  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'api_key'), false)
  assert.equal(payload.has_api_key, true)
  assert.deepEqual(payload.model, ['seedream-5-0'])
  assert.deepEqual(payload.settings, { size: '2K' })
})

runTest('buildAiConfigUpdatePatch maps supported fields and serializes model/settings', () => {
  const patch = buildAiConfigUpdatePatch(
    {
      provider: 'volcengine',
      base_url: 'https://ark.cn-beijing.volces.com',
      model: ['seedance'],
      settings: null,
      priority: 0,
      is_active: false,
      unknown: 'ignored',
    },
    '2026-05-08T00:01:00.000Z',
  )

  assert.deepEqual(patch, {
    updatedAt: '2026-05-08T00:01:00.000Z',
    provider: 'volcengine',
    baseUrl: 'https://ark.cn-beijing.volces.com',
    model: '["seedance"]',
    settings: null,
    priority: 0,
    isActive: false,
  })
})

runTest('validateAiConfigProbeBody preserves probe required-field checks', () => {
  assert.equal(validateAiConfigProbeBody({ service_type: 'video', provider: 'vidu' }), 'service_type, provider and base_url are required')
  assert.equal(validateAiConfigProbeBody({ service_type: 'audio', provider: 'x', base_url: 'https://example.com' }), 'service_type must be one of text, image, video or vision')
  assert.equal(validateAiConfigProbeBody({ service_type: 'video', provider: 'vidu', base_url: 'https://example.com' }), null)
  assert.equal(validateAiConfigProbeBody({ config_id: 1 }), null)
})

runTest('buildAiConfigProbePayload returns readable probe messages', () => {
  assert.equal(buildAiConfigProbePayload({
    ok: true,
    status: 200,
    statusText: 'OK',
    method: 'GET',
    url: 'https://provider.example.com/v1/models',
    responseText: 'ok',
  }).message, 'Endpoint reachable; authentication and path look valid')

  assert.equal(buildAiConfigProbePayload({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    method: 'GET',
    url: 'https://provider.example.com/v1/models',
    responseText: 'unauthorized',
  }).message, 'Endpoint responded; check status code for authentication or path issues')

  assert.equal(buildAiConfigProbePayload({
    ok: false,
    status: 500,
    statusText: 'Server Error',
    method: 'GET',
    url: 'https://provider.example.com/v1/models',
    responseText: 'server error',
  }).message, 'Endpoint did not return an expected probe status; check Base URL and proxy settings')
})

runTest('errorMessageFromUnknown normalizes probe failures without any', () => {
  assert.equal(errorMessageFromUnknown(new Error('network failed')), 'network failed')
  assert.equal(errorMessageFromUnknown('plain failure'), 'plain failure')
  assert.equal(errorMessageFromUnknown({ message: 'not trusted' }), 'Request failed')
})

runTest('validateAiConfigCreateBody accepts vision service_type', () => {
  assert.equal(validateAiConfigCreateBody({ service_type: 'vision', provider: 'ali' }), null)
})

runTest('validateAiConfigProbeBody accepts vision service_type', () => {
  assert.equal(
    validateAiConfigProbeBody({
      service_type: 'vision',
      provider: 'ali',
      base_url: 'https://dashscope.aliyuncs.com',
    }),
    null,
  )
})
