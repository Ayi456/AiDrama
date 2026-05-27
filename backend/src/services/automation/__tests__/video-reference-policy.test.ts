import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAutomationVideoReferences } from '../video-reference-policy.js'

test('buildAutomationVideoReferences uses current scene and character images for the first storyboard', () => {
  const result = buildAutomationVideoReferences({
    storyboard: {
      id: 11,
      sceneId: 3,
    },
    previousTailFrameUrl: null,
    characterIds: [7, 8],
    characters: [
      { id: 7, imageUrl: 'lead.png', characterAssetImageUrl: 'lead-asset.png' },
      { id: 8, imageUrl: 'support.png' },
      { id: 9, imageUrl: 'other.png' },
    ],
    scenes: [
      { id: 3, imageUrl: 'atrium.png' },
      { id: 4, imageUrl: 'street.png' },
    ],
  })

  assert.deepEqual(result, {
    referenceMode: 'multimodal',
    referenceImageUrls: ['lead.png', 'support.png', 'atrium.png'],
  })
})

test('buildAutomationVideoReferences prepends previous tail frame for later storyboards', () => {
  const result = buildAutomationVideoReferences({
    storyboard: {
      id: 12,
      sceneId: 3,
    },
    previousTailFrameUrl: 'prev-tail.png',
    characterIds: [7],
    characters: [
      { id: 7, imageUrl: 'lead.png' },
    ],
    scenes: [
      { id: 3, imageUrl: 'atrium.png' },
    ],
  })

  assert.deepEqual(result.referenceImageUrls, ['prev-tail.png', 'lead.png', 'atrium.png'])
})

test('buildAutomationVideoReferences requires previous tail frame when requested', () => {
  assert.throws(() => buildAutomationVideoReferences({
    storyboard: {
      id: 13,
      sceneId: 3,
    },
    previousTailFrameUrl: null,
    requirePreviousTailFrame: true,
    characterIds: [7],
    characters: [
      { id: 7, imageUrl: 'lead.png' },
    ],
    scenes: [
      { id: 3, imageUrl: 'atrium.png' },
    ],
  }), /missing previous tail frame/)
})
