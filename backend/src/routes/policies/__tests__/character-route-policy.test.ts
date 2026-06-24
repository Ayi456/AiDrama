import assert from 'node:assert/strict'

import {
  buildCharacterCreateValues,
  buildCharacterUpdatePatch,
  readCharacterCreateInput,
} from '../character-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('readCharacterCreateInput reads id aliases and trims the required name', () => {
  assert.deepEqual(readCharacterCreateInput({
    dramaId: '42',
    episode_id: 7,
    character_asset_id: '9',
    name: '  Lead  ',
  }), {
    dramaId: 42,
    episodeId: 7,
    characterAssetId: 9,
    name: 'Lead',
  })
})

runTest('buildCharacterCreateValues normalizes insert fields without duplicating route code', () => {
  assert.deepEqual(buildCharacterCreateValues({
    role: '  protagonist  ',
    description: '  sharp and calm  ',
    appearance: '  black coat  ',
    personality: '  reserved  ',
    imagePrompt: '  cinematic portrait  ',
    image_url: '  /static/hero.png  ',
    localPath: '  static/hero.png  ',
  }, {
    dramaId: 3,
    characterAssetId: 0,
    name: 'Lead',
  }, '2026-06-24T00:00:00.000Z'), {
    dramaId: 3,
    name: 'Lead',
    role: 'protagonist',
    description: 'sharp and calm',
    appearance: 'black coat',
    personality: 'reserved',
    imagePrompt: 'cinematic portrait',
    imageUrl: '/static/hero.png',
    localPath: 'static/hero.png',
    characterAssetId: null,
    createdAt: '2026-06-24T00:00:00.000Z',
    updatedAt: '2026-06-24T00:00:00.000Z',
  })
})

runTest('buildCharacterUpdatePatch keeps existing alias precedence', () => {
  assert.deepEqual(buildCharacterUpdatePatch({
    name: 'Lead',
    image_prompt: 'snake prompt',
    imagePrompt: 'camel prompt',
    image_url: 'snake url',
    imageUrl: 'camel url',
    local_path: 'snake local',
    localPath: 'camel local',
    character_asset_id: '5',
    characterAssetId: '7',
  }, '2026-06-24T00:01:00.000Z'), {
    updatedAt: '2026-06-24T00:01:00.000Z',
    name: 'Lead',
    imagePrompt: 'snake prompt',
    imageUrl: 'camel url',
    localPath: 'camel local',
    characterAssetId: 5,
  })
})

runTest('buildCharacterUpdatePatch can clear the bound asset', () => {
  assert.deepEqual(buildCharacterUpdatePatch({
    character_asset_id: 0,
  }, '2026-06-24T00:02:00.000Z'), {
    updatedAt: '2026-06-24T00:02:00.000Z',
    characterAssetId: null,
  })
})

runTest('buildCharacterUpdatePatch lets explicit snake_case asset clearing win over camelCase', () => {
  assert.deepEqual(buildCharacterUpdatePatch({
    character_asset_id: 0,
    characterAssetId: 7,
  }, '2026-06-24T00:03:00.000Z'), {
    updatedAt: '2026-06-24T00:03:00.000Z',
    characterAssetId: null,
  })
})
