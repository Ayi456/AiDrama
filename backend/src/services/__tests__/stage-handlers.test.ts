import test from 'node:test'
import assert from 'node:assert/strict'
import { STAGE_ORDER, nextStage, terminalStage, isExtractCompleteFromCounts } from '../automation/stage-handlers.js'

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

test('isExtractCompleteFromCounts returns false when no storyboards exist', () => {
  const result = isExtractCompleteFromCounts({ storyboards: 0, episodeCharacters: 0, episodeScenes: 0 })
  assert.equal(result, false)
})

test('isExtractCompleteFromCounts returns true when storyboards and character links exist', () => {
  const result = isExtractCompleteFromCounts({ storyboards: 5, episodeCharacters: 3, episodeScenes: 2 })
  assert.equal(result, true)
})

test('isExtractCompleteFromCounts returns false when storyboards exist but no character links', () => {
  const result = isExtractCompleteFromCounts({ storyboards: 5, episodeCharacters: 0, episodeScenes: 2 })
  assert.equal(result, false)
})
