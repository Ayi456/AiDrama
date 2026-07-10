import assert from 'node:assert/strict'

import {
  getSettingsTemplate,
  listProviderPresets,
  mergeVisionSettings,
  parseSettingsJson,
  resolveEndpointHint,
} from '../settings-ai-service-policy.ts'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('settings JSON accepts objects and rejects non-object values', () => {
  assert.deepEqual(parseSettingsJson(''), {})
  assert.deepEqual(
    parseSettingsJson('{"control":{"watermark":false}}'),
    { control: { watermark: false } },
  )
  assert.throws(() => parseSettingsJson('[]'), /JSON 对象/)
})

runTest('vision settings persist enablement and clamp retry attempts', () => {
  assert.deepEqual(
    mergeVisionSettings('vision', {}, true, 9),
    { enabled: true, maxAttempts: 5 },
  )
  assert.deepEqual(
    mergeVisionSettings('vision', {}, false, 0),
    { enabled: false, maxAttempts: 1 },
  )
  assert.deepEqual(
    mergeVisionSettings('text', { keep: true }, true, 4),
    { keep: true },
  )
})

runTest('endpoint hints preserve provider-specific compatibility paths', () => {
  assert.equal(
    resolveEndpointHint('ali', 'https://dashscope.aliyuncs.com', 'vision'),
    'https://dashscope.aliyuncs.com/compatible-mode/v1',
  )
  assert.equal(
    resolveEndpointHint('volcengine', 'https://ark.cn-beijing.volces.com', 'image'),
    'https://ark.cn-beijing.volces.com/api/v3',
  )
})

runTest('provider presets retain stable ordering and default controls', () => {
  assert.equal(listProviderPresets('video')[0]?.provider, 'volcengine')
  assert.deepEqual(
    getSettingsTemplate('video', 'volcengine').control,
    { generateAudio: true, returnLastFrame: false, watermark: false },
  )
})
