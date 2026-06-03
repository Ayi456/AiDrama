import test from 'node:test'
import assert from 'node:assert/strict'
import { STAGE_ORDER, nextStage, terminalStage, isExtractCompleteFromCounts, isStoryboardChunkingComplete, nextStoryboardChunkIndex } from '../automation/stage-policy.js'

test('STAGE_ORDER follows the spec', () => {
  assert.deepEqual(STAGE_ORDER, ['extract', 'character_image', 'scene_image', 'video', 'merge', 'done'])
})

test('nextStage advances through the chain', () => {
  assert.equal(nextStage('extract'), 'character_image')
  assert.equal(nextStage('character_image'), 'scene_image')
  assert.equal(nextStage('scene_image'), 'video')
  assert.equal(nextStage('video'), 'merge')
  assert.equal(nextStage('merge'), 'done')
  assert.equal(nextStage('done'), 'done')
})

test('nextStage maps legacy shot_image stage to video', () => {
  assert.equal(nextStage('shot_image'), 'video')
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

test('storyboard chunking is incomplete until the cursor reaches total chunks', () => {
  assert.equal(isStoryboardChunkingComplete({ existingStoryboards: 0, cursor: 0, totalChunks: 3 }), false)
  assert.equal(isStoryboardChunkingComplete({ existingStoryboards: 4, cursor: 1, totalChunks: 3 }), false)
  assert.equal(isStoryboardChunkingComplete({ existingStoryboards: 9, cursor: 3, totalChunks: 3 }), true)
})

test('storyboard chunking treats pre-existing storyboards (cursor 0) as already done', () => {
  assert.equal(isStoryboardChunkingComplete({ existingStoryboards: 7, cursor: 0, totalChunks: 3 }), true)
})

test('nextStoryboardChunkIndex points at the chunk after the cursor, or null when done', () => {
  assert.equal(nextStoryboardChunkIndex({ existingStoryboards: 0, cursor: 0, totalChunks: 3 }), 1)
  assert.equal(nextStoryboardChunkIndex({ existingStoryboards: 4, cursor: 1, totalChunks: 3 }), 2)
  assert.equal(nextStoryboardChunkIndex({ existingStoryboards: 9, cursor: 3, totalChunks: 3 }), null)
  assert.equal(nextStoryboardChunkIndex({ existingStoryboards: 7, cursor: 0, totalChunks: 3 }), null)
})
