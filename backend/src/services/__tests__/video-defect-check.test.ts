import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampMaxAttempts,
  runDefectCheck,
  type DefectVisionConfig,
} from '../generation/video-defect-check.js'

const baseConfig: DefectVisionConfig = {
  baseUrl: 'https://x',
  apiKey: 'k',
  model: 'qwen3.6-plus',
  enabled: true,
  maxAttempts: 2,
}

const fakeAnalyze = (result: { verdict: 'complete' | 'defect' | 'unknown'; missingActions?: string[] }) => {
  return async () => ({
    rawText: 'raw',
    verdict: result.verdict,
    missingActions: result.missingActions ?? [],
  })
}

const throwingAnalyze = (err: Error) => async () => { throw err }

test('clampMaxAttempts: clamps and falls back', () => {
  assert.equal(clampMaxAttempts(undefined), 2)
  assert.equal(clampMaxAttempts(0), 1)
  assert.equal(clampMaxAttempts(99), 5)
  assert.equal(clampMaxAttempts(3), 3)
  assert.equal(clampMaxAttempts('not a number'), 2)
})

test('skipped: no vision config → publish', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: null,
    analyze: fakeAnalyze({ verdict: 'complete' }),
  })
  assert.equal(r.action, 'publish')
  assert.equal(r.verdict, 'skipped')
  assert.equal(r.error, 'no_vision_config')
})

test('skipped: enabled=false → publish', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: { ...baseConfig, enabled: false },
    analyze: fakeAnalyze({ verdict: 'defect' }),
  })
  assert.equal(r.action, 'publish')
  assert.equal(r.verdict, 'skipped')
  assert.equal(r.error, 'disabled')
})

test('complete: publish', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: baseConfig,
    analyze: fakeAnalyze({ verdict: 'complete' }),
  })
  assert.equal(r.action, 'publish')
  assert.equal(r.verdict, 'complete')
})

test('defect & under cap → regenerate', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: baseConfig, // maxAttempts=2
    analyze: fakeAnalyze({ verdict: 'defect', missingActions: ['拔剑'] }),
  })
  assert.equal(r.action, 'regenerate')
  assert.equal(r.verdict, 'defect')
  assert.deepEqual(r.missingActions, ['拔剑'])
})

test('defect at last attempt → publish + defect_exhausted', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 1, prompt: 'p', // attempt+1=2 == max
    visionConfig: baseConfig,
    analyze: fakeAnalyze({ verdict: 'defect', missingActions: ['拔剑'] }),
  })
  assert.equal(r.action, 'publish')
  assert.equal(r.verdict, 'defect_exhausted')
})

test('unknown verdict → publish', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: baseConfig,
    analyze: fakeAnalyze({ verdict: 'unknown' }),
  })
  assert.equal(r.action, 'publish')
  assert.equal(r.verdict, 'unknown')
  assert.equal(r.error, 'unparseable')
})

test('analyze throws → publish + unknown + error', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: baseConfig,
    analyze: throwingAnalyze(new Error('qwen-vision HTTP 401: bad key')),
  })
  assert.equal(r.action, 'publish')
  assert.equal(r.verdict, 'unknown')
  assert.match(r.error ?? '', /401/)
})

test('decision always includes attemptedAt and model', async () => {
  const r = await runDefectCheck({
    videoUrl: 'u', attemptNumber: 0, prompt: 'p',
    visionConfig: baseConfig,
    analyze: fakeAnalyze({ verdict: 'complete' }),
  })
  assert.equal(typeof r.attemptedAt, 'string')
  assert.ok(r.attemptedAt.length > 0)
  assert.equal(r.model, 'qwen3.6-plus')
})
