import assert from 'node:assert/strict'

import {
  buildCharacterAssetCreateValues,
  buildCharacterAssetPublicPayload,
  buildCharacterAssetUpdatePatch,
  validateCharacterAssetCreateBody,
} from '../character-asset-route-policy.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('validateCharacterAssetCreateBody requires a name and image URL', () => {
  assert.equal(validateCharacterAssetCreateBody({}), 'name and image_url are required')
  assert.equal(validateCharacterAssetCreateBody({ name: '男主模板' }), 'name and image_url are required')
  assert.equal(validateCharacterAssetCreateBody({ name: '男主模板', image_url: '/static/uploads/hero.png' }), null)
})

runTest('buildCharacterAssetCreateValues normalizes asset fields for insert', () => {
  const values = buildCharacterAssetCreateValues({
    name: '男主模板',
    gender: 'male',
    role_preset: 'male_lead',
    image_url: '/static/uploads/hero.png',
    local_path: 'static/uploads/hero.png',
    description: '现代短剧男主',
    appearance: '黑发，西装',
    tags: ['都市', '冷峻'],
    is_default: true,
  }, '2026-05-09T00:00:00.000Z')

  assert.deepEqual(values, {
    name: '男主模板',
    gender: 'male',
    rolePreset: 'male_lead',
    imageUrl: '/static/uploads/hero.png',
    localPath: 'static/uploads/hero.png',
    description: '现代短剧男主',
    appearance: '黑发，西装',
    tags: '["都市","冷峻"]',
    isDefault: true,
    isActive: true,
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
  })
})

runTest('buildCharacterAssetUpdatePatch preserves explicit false values', () => {
  const patch = buildCharacterAssetUpdatePatch({
    name: '女主模板',
    is_default: false,
    is_active: false,
  }, '2026-05-09T00:01:00.000Z')

  assert.deepEqual(patch, {
    updatedAt: '2026-05-09T00:01:00.000Z',
    name: '女主模板',
    isDefault: false,
    isActive: false,
  })
})

runTest('buildCharacterAssetPublicPayload parses tags for API responses', () => {
  const payload = buildCharacterAssetPublicPayload({
    id: 7,
    name: '默认女主',
    gender: 'female',
    rolePreset: 'female_lead',
    imageUrl: '/static/uploads/heroine.png',
    localPath: 'static/uploads/heroine.png',
    description: '明亮外向',
    appearance: '长发，白色外套',
    tags: '["甜宠","都市"]',
    isDefault: true,
    isActive: true,
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:01:00.000Z',
  })

  assert.deepEqual(payload, {
    id: 7,
    name: '默认女主',
    gender: 'female',
    role_preset: 'female_lead',
    image_url: '/static/uploads/heroine.png',
    local_path: 'static/uploads/heroine.png',
    description: '明亮外向',
    appearance: '长发，白色外套',
    tags: ['甜宠', '都市'],
    is_default: true,
    is_active: true,
    created_at: '2026-05-09T00:00:00.000Z',
    updated_at: '2026-05-09T00:01:00.000Z',
  })
})
