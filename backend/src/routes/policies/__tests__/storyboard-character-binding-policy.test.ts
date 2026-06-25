import assert from 'node:assert/strict'

import {
  inferMentionedStoryboardCharacterIds,
  mergeStoryboardInputCharacterIds,
  mergeStoryboardCharacterIds,
} from '../storyboard-character-binding-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

const candidates = [
  { id: 1, name: '\u5546\u4f1a\u4f1a\u957f' },
  { id: 2, name: '\u9646\u5c18' },
  { id: 3, name: '\u5c18' },
  { id: 4, name: '\u9752\u4e91\u5b97\u5f1f\u5b50\uff08\u540e\u671f\uff09' },
]

runTest('inferMentionedStoryboardCharacterIds includes a character named as the gaze target', () => {
  const ids = inferMentionedStoryboardCharacterIds({
    title: '\u5546\u4f1a\u4f1a\u957f\u7ad9\u5728\u5bb4\u5e2d\u95f4\uff0c\u9762\u671d\u9752\u4e91\u5b97\u5e2d\u4f4d\u65b9\u5411\uff0c\u76ee\u5149\u843d\u5728\u9646\u5c18\u8eab\u4e0a\u3002',
    description: '\u4ed6\u7a7f\u91d1\u6234\u7389\uff0c\u7b11\u5bb9\u53ef\u63ac\uff0c\u4f46\u773c\u5e95\u900f\u7740\u7cbe\u660e\u3002',
  }, candidates)

  assert.deepEqual(ids, [1, 2])
})

runTest('inferMentionedStoryboardCharacterIds ignores one-character names to avoid noisy matches', () => {
  const ids = inferMentionedStoryboardCharacterIds({
    description: '\u98de\u5c18\u5728\u5bb4\u5e2d\u706f\u5149\u91cc\u6d6e\u52a8\uff0c\u6240\u6709\u4eba\u5c4f\u606f\u3002',
  }, candidates)

  assert.deepEqual(ids, [])
})

runTest('inferMentionedStoryboardCharacterIds can match names without parenthetical suffixes', () => {
  const ids = inferMentionedStoryboardCharacterIds({
    video_prompt: '\u9752\u4e91\u5b97\u5f1f\u5b50\u62ac\u5934\u770b\u5411\u4e3b\u4f4d\u3002',
  }, candidates)

  assert.deepEqual(ids, [4])
})

runTest('mergeStoryboardCharacterIds preserves explicit ids and appends inferred episode candidates', () => {
  const ids = mergeStoryboardCharacterIds([99, 1], {
    action: '\u5546\u4f1a\u4f1a\u957f\u62ac\u624b\u793a\u610f\uff0c\u9646\u5c18\u88ab\u4f17\u4eba\u770b\u5411\u3002',
  }, candidates)

  assert.deepEqual(ids, [99, 1, 2])
})

runTest('mergeStoryboardInputCharacterIds fills missing character_ids from storyboard text', () => {
  const ids = mergeStoryboardInputCharacterIds({
    character_ids: [1],
    title: '\u5546\u4f1a\u4f1a\u957f\u7ad9\u5728\u5bb4\u5e2d\u95f4\uff0c\u76ee\u5149\u843d\u5728\u9646\u5c18\u8eab\u4e0a\u3002',
  }, candidates)

  assert.deepEqual(ids, [1, 2])
})
