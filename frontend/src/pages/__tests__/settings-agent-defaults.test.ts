import assert from 'node:assert/strict'

import {
  settingsAgentDefs,
  settingsDefaultPrompts,
} from '../settings-agent-defaults.ts'

assert.deepEqual(
  settingsAgentDefs.map(item => item.type),
  [
    'script_rewriter',
    'extractor',
    'storyboard_breaker',
    'grid_prompt_generator',
  ],
)
assert.match(settingsDefaultPrompts.extractor, /角色的 appearance 必须做完整定装/)
assert.match(settingsDefaultPrompts.storyboard_breaker, /导演层优先原则/)
assert.match(settingsDefaultPrompts.storyboard_breaker, /分秒时间轴/)
assert.match(settingsDefaultPrompts.storyboard_breaker, /first_frame_prompt/)
assert.match(settingsDefaultPrompts.storyboard_breaker, /4-15 的整数/)
assert.match(settingsDefaultPrompts.storyboard_breaker, /existing_storyboards/)
assert.match(settingsDefaultPrompts.grid_prompt_generator, /consistent art style/)

console.log('PASS settings Agent defaults expose the complete prompt catalog')
