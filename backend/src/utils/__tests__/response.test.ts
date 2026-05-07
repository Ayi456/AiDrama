import assert from 'node:assert/strict'

import { Hono } from 'hono'

import {
  badRequest,
  created,
  notFound,
  serverError,
  success,
} from '../response.js'

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('success returns a 200 envelope with the provided payload', async () => {
  const app = new Hono()
  app.get('/success', (c) => success(c, { ok: true }))

  const response = await app.request('/success')
  const json = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(json, {
    code: 200,
    data: { ok: true },
    message: 'success',
  })
})

runTest('success and created normalize explicit undefined payloads to null', async () => {
  const app = new Hono()
  app.get('/success', (c) => success(c, undefined))
  app.get('/created', (c) => created(c, undefined))

  const successResponse = await app.request('/success')
  const successJson = await successResponse.json()
  const createdResponse = await app.request('/created')
  const createdJson = await createdResponse.json()

  assert.equal(successResponse.status, 200)
  assert.deepEqual(successJson, {
    code: 200,
    data: null,
    message: 'success',
  })

  assert.equal(createdResponse.status, 201)
  assert.deepEqual(createdJson, {
    code: 201,
    data: null,
    message: 'created',
  })
})

runTest('error helpers return stable status codes and messages', async () => {
  const app = new Hono()
  app.get('/bad', (c) => badRequest(c, 'broken input'))
  app.get('/missing', (c) => notFound(c))
  app.get('/error', (c) => serverError(c, 'boom'))

  const badResponse = await app.request('/bad')
  const badJson = await badResponse.json()
  const missingResponse = await app.request('/missing')
  const missingJson = await missingResponse.json()
  const errorResponse = await app.request('/error')
  const errorJson = await errorResponse.json()

  assert.equal(badResponse.status, 400)
  assert.deepEqual(badJson, { code: 400, message: 'broken input' })

  assert.equal(missingResponse.status, 404)
  assert.deepEqual(missingJson, { code: 404, message: 'not found' })

  assert.equal(errorResponse.status, 500)
  assert.deepEqual(errorJson, { code: 500, message: 'boom' })
})
