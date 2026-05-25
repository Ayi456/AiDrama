import test from 'node:test'
import assert from 'node:assert/strict'
import { STAGE_ORDER, nextStage, terminalStage } from '../automation/stage-handlers.js'

test('STAGE_ORDER follows the spec', () => {
  assert.deepEqual(STAGE_ORDER, ['extract', 'character_image', 'scene_image', 'shot_image', 'video', 'merge', 'done'])
})

test('nextStage advances through the chain', () => {
  assert.equal(nextStage('extract'), 'character_image')
  assert.equal(nextStage('character_image'), 'scene_image')
  assert.equal(nextStage('scene_image'), 'shot_image')
  assert.equal(nextStage('shot_image'), 'video')
  assert.equal(nextStage('video'), 'merge')
  assert.equal(nextStage('merge'), 'done')
  assert.equal(nextStage('done'), 'done')
})

test('terminalStage is done', () => {
  assert.equal(terminalStage(), 'done')
})
