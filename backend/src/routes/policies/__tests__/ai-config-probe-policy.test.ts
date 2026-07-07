import assert from 'node:assert/strict'

import { buildProbe } from '../ai-config-probe-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('gemini probe posts generateContent with key param and dual auth headers', () => {
  const probe = buildProbe('text', 'Gemini', 'https://gen.example.com', 'gemini-2.5-pro', 'sk-g')

  assert.equal(probe.method, 'POST')
  const url = new URL(probe.url)
  assert.match(url.pathname, /\/v1beta\/models\/gemini-2.5-pro:generateContent$/)
  assert.equal(url.searchParams.get('key'), 'sk-g')
  assert.equal(probe.headers.Authorization, 'Bearer sk-g')
  assert.equal(probe.headers['x-goog-api-key'], 'sk-g')
  assert.equal(probe.headers['Content-Type'], 'application/json')
  assert.deepEqual(probe.body, {})
})

runTest('gemini probe falls back to default model and omits key without api key', () => {
  const probe = buildProbe('text', 'gemini', 'https://gen.example.com')

  const url = new URL(probe.url)
  assert.match(url.pathname, /\/models\/gemini-2.5-flash:generateContent$/)
  assert.equal(url.searchParams.get('key'), null)
  assert.equal(probe.headers.Authorization, undefined)
})

runTest('openai-compatible providers probe GET /v1/models with bearer auth only', () => {
  for (const provider of ['openai', 'OpenRouter', 'chatfire']) {
    const probe = buildProbe('text', provider, 'https://api.example.com', 'gpt-x', 'sk-o')

    assert.equal(probe.method, 'GET')
    assert.match(probe.url, /\/v1\/models$/)
    assert.equal(probe.headers.Authorization, 'Bearer sk-o')
    assert.equal(probe.headers['Content-Type'], undefined)
    assert.equal(probe.body, undefined)
  }
})

runTest('ali vision and text probes use compatible-mode chat completions with ping message', () => {
  const vision = buildProbe('vision', 'ali', 'https://dashscope.example.com', '', 'sk-a')
  assert.match(vision.url, /\/compatible-mode\/v1\/chat\/completions$/)
  assert.deepEqual(vision.body, { model: 'qwen3.6-plus', messages: [{ role: 'user', content: 'ping' }] })

  const text = buildProbe('text', 'ali', 'https://dashscope.example.com', '', 'sk-a')
  assert.deepEqual(text.body, { model: 'qwen-plus', messages: [{ role: 'user', content: 'ping' }] })

  const custom = buildProbe('text', 'ali', 'https://dashscope.example.com', 'qwen-max', 'sk-a')
  assert.deepEqual(custom.body, { model: 'qwen-max', messages: [{ role: 'user', content: 'ping' }] })
})

runTest('ali media probes route to aigc video or image synthesis endpoints', () => {
  const video = buildProbe('video', 'ali', 'https://dashscope.example.com', '', 'sk-a')
  assert.match(video.url, /\/api\/v1\/services\/aigc\/video-generation\/video-synthesis$/)

  const image = buildProbe('image', 'ali', 'https://dashscope.example.com', '', 'sk-a')
  assert.match(image.url, /\/api\/v1\/services\/aigc\/image-generation\/generation$/)
})

runTest('volcengine probes split video tasks from image generations under /api/v3', () => {
  const video = buildProbe('video', 'volcengine', 'https://ark.example.com', '', 'sk-v')
  assert.match(video.url, /\/api\/v3\/contents\/generations\/tasks$/)

  const image = buildProbe('image', 'volcengine', 'https://ark.example.com', '', 'sk-v')
  assert.match(image.url, /\/api\/v3\/images\/generations$/)
})

runTest('minimax probes split video from image generation under /v1', () => {
  const video = buildProbe('video', 'minimax', 'https://mm.example.com', '', 'sk-m')
  assert.match(video.url, /\/v1\/video_generation$/)

  const image = buildProbe('image', 'minimax', 'https://mm.example.com', '', 'sk-m')
  assert.match(image.url, /\/v1\/image_generation$/)
})

runTest('vidu probe uses Token auth scheme instead of Bearer', () => {
  const probe = buildProbe('video', 'vidu', 'https://vidu.example.com', '', 'sk-vd')

  assert.match(probe.url, /\/ent\/v2\/img2video$/)
  assert.equal(probe.headers.Authorization, 'Token sk-vd')
  assert.equal(probe.headers['Content-Type'], 'application/json')
})

runTest('unknown providers fall back to a bearer GET against the model path', () => {
  const withModel = buildProbe('text', 'custom', 'https://api.example.com', 'my-model', 'sk-c')
  assert.equal(withModel.method, 'GET')
  assert.match(withModel.url, /\/my-model$/)
  assert.equal(withModel.headers.Authorization, 'Bearer sk-c')
  assert.equal(withModel.body, undefined)

  const bare = buildProbe('text', 'custom', 'https://api.example.com')
  assert.match(bare.url, /example\.com\/$/)
  assert.deepEqual(bare.headers, {})
})
