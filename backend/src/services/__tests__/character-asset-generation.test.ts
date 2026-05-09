import assert from 'node:assert/strict'

import { resolveCharacterAssetReferenceImages } from '../assets/character-asset-generation.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('resolveCharacterAssetReferenceImages returns no references for unbound characters', () => {
  assert.deepEqual(resolveCharacterAssetReferenceImages(
    { characterAssetId: null },
    { id: 1, imageUrl: '/static/uploads/default-male.png', localPath: null, isActive: true, deletedAt: null },
  ), [])
})

runTest('resolveCharacterAssetReferenceImages returns no references when the bound asset is unavailable', () => {
  assert.deepEqual(resolveCharacterAssetReferenceImages({ characterAssetId: 8 }, null), [])
  assert.deepEqual(resolveCharacterAssetReferenceImages(
    { characterAssetId: 8 },
    { id: 8, imageUrl: '/static/uploads/disabled.png', localPath: null, isActive: false, deletedAt: null },
  ), [])
})

runTest('resolveCharacterAssetReferenceImages uses the bound active asset image as the only automatic reference', () => {
  assert.deepEqual(resolveCharacterAssetReferenceImages(
    { characterAssetId: 8 },
    { id: 8, imageUrl: '/static/uploads/bound.png', localPath: 'static/uploads/bound.png', isActive: true, deletedAt: null },
  ), ['/static/uploads/bound.png'])
})
