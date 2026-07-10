import assert from 'node:assert/strict'

import {
  deriveShotPrompt,
  resolveFrameAspectRatio,
} from '../chapterShotImageWorkbenchPolicy.ts'

assert.equal(resolveFrameAspectRatio('16:9'), '16 / 9')
assert.equal(resolveFrameAspectRatio('broken'), '1 / 1')

const prompt = deriveShotPrompt({
  description: '人物推门进入',
  shot_type: '中景',
  location: '旧仓库',
})
assert.match(prompt, /人物推门进入/)
assert.match(prompt, /中景/)
assert.match(prompt, /旧仓库/)

console.log('PASS shot image workbench policy is deterministic')
