import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRegenPrompt,
  stripPreviousDefectHint,
  enqueueDefectRegeneration,
  type VideoRecordForRegen,
} from '../generation/video-regeneration.js'

const baseRecord: VideoRecordForRegen = {
  id: 42,
  prompt: '一名剑客出鞘并跃下',
  model: 'wanx-v1',
  configId: 7,
  storyboardId: 99,
  imageUrl: 'https://x/a.png',
  firstFrameUrl: 'https://x/f.png',
  lastFrameUrl: null,
  duration: 5,
  fps: 24,
  resolution: '1280x720',
  aspectRatio: '16:9',
  defectCheckAttempt: 0,
}

test('stripPreviousDefectHint: removes current defect block', () => {
  const withHint = '原始内容\n\n【本次生成硬性要求：必须完整拍到以下关键动作，不能用镜头切换、省略或结果画面替代过程】\n- 拔剑'
  assert.equal(stripPreviousDefectHint(withHint), '原始内容')
})

test('stripPreviousDefectHint: removes legacy prior defect block', () => {
  const withHint = '原始内容\n\n【上次生成存在动作链断裂，请确保以下动作被完整拍到】\n- 拔剑'
  assert.equal(stripPreviousDefectHint(withHint), '原始内容')
})

test('stripPreviousDefectHint: idempotent on plain prompt', () => {
  assert.equal(stripPreviousDefectHint('普通内容'), '普通内容')
})

test('buildRegenPrompt: appends bullet list of missing actions', () => {
  const r = buildRegenPrompt('原始 prompt', ['拔剑', '推门'])
  assert.match(r, /^原始 prompt\n\n【本次生成硬性要求/)
  assert.match(r, /- 拔剑\n- 推门$/)
})

test('buildRegenPrompt: empty missingActions falls back to generic line', () => {
  const r = buildRegenPrompt('原始', [])
  assert.match(r, /必须完整拍到所有关键状态变化所需的动作过程/)
})

test('buildRegenPrompt: does not stack hints across regenerations', () => {
  const once = buildRegenPrompt('原始', ['拔剑'])
  const twice = buildRegenPrompt(once, ['推门'])
  // 只应有一段【本次生成...】前缀
  const occurrences = twice.split('【本次生成硬性要求').length - 1
  assert.equal(occurrences, 1)
  assert.match(twice, /- 推门$/)
})

test('enqueueDefectRegeneration: forwards params and increments attempt + parent id', async () => {
  let captured: any = null
  const enqueue = async (params: any) => {
    captured = params
    return 88
  }
  const newId = await enqueueDefectRegeneration({
    originalRecord: baseRecord,
    missingActions: ['拔剑'],
    enqueue,
  })
  assert.equal(newId, 88)
  assert.equal(captured.defectCheckParentId, 42)
  assert.equal(captured.defectCheckAttempt, 1)
  assert.equal(captured.model, 'wanx-v1')
  assert.equal(captured.configId, 7)
  assert.equal(captured.storyboardId, 99)
  assert.equal(captured.imageUrl, 'https://x/a.png')
  assert.equal(captured.firstFrameUrl, 'https://x/f.png')
  assert.equal(captured.duration, 5)
  assert.equal(captured.aspectRatio, '16:9')
  assert.match(captured.prompt, /- 拔剑$/)
})

test('enqueueDefectRegeneration: handles null prompt with empty string', async () => {
  let captured: any = null
  const enqueue = async (params: any) => { captured = params; return 1 }
  await enqueueDefectRegeneration({
    originalRecord: { ...baseRecord, prompt: null },
    missingActions: ['x'],
    enqueue,
  })
  assert.match(captured.prompt, /\n- x$/)
})

test('enqueueDefectRegeneration: forwards referenceMode and reference URL columns', async () => {
  let captured: any = null
  const enqueue = async (params: any) => { captured = params; return 7 }
  await enqueueDefectRegeneration({
    originalRecord: {
      ...baseRecord,
      dramaId: 11,
      referenceMode: 'last_frame',
      referenceImageUrls: '["https://x/r1.png"]',
      referenceVideoUrls: null,
      referenceAudioUrls: '["https://x/a1.mp3"]',
    },
    missingActions: ['x'],
    enqueue,
  })
  assert.equal(captured.dramaId, 11)
  assert.equal(captured.referenceMode, 'last_frame')
  assert.equal(captured.referenceImageUrls, '["https://x/r1.png"]')
  assert.equal(captured.referenceVideoUrls, null)
  assert.equal(captured.referenceAudioUrls, '["https://x/a1.mp3"]')
})
