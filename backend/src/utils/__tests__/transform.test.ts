import assert from 'node:assert/strict'

import { toSnakeCase, toSnakeCaseArray } from '../transform.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('toSnakeCase collapses uppercase acronym runs into a single snake_case word', () => {
  const result = toSnakeCase({
    imageURL: 'https://example.com/image.png',
    apiKeyID: 7,
  })

  assert.deepEqual(result, {
    image_url: 'https://example.com/image.png',
    api_key_id: 7,
  })
})

runTest('toSnakeCaseArray returns converted copies without mutating the source rows', () => {
  const rows = [
    { storyboardId: 1, updatedAt: '2026-05-07T00:00:00.000Z' },
    { sceneId: 2, imageURL: '/static/scene.png' },
  ]

  const result = toSnakeCaseArray(rows)

  assert.deepEqual(result, [
    { storyboard_id: 1, updated_at: '2026-05-07T00:00:00.000Z' },
    { scene_id: 2, image_url: '/static/scene.png' },
  ])
  assert.deepEqual(rows, [
    { storyboardId: 1, updatedAt: '2026-05-07T00:00:00.000Z' },
    { sceneId: 2, imageURL: '/static/scene.png' },
  ])
})
