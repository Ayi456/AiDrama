import assert from 'node:assert/strict'
import type { Context } from 'hono'

import { hasOwn, readBodyId, readBodyText, readJsonBody } from '../route-body.js'

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('readJsonBody returns parsed objects and normalizes non-objects to empty payloads', async () => {
  const parsed = await readJsonBody({
    req: {
      json: async () => ({ prompt: 'scene' }),
    },
  } as unknown as Pick<Context, 'req'>)

  const arrayResult = await readJsonBody({
    req: {
      json: async () => ['not', 'an', 'object'],
    },
  } as unknown as Pick<Context, 'req'>)

  const failedResult = await readJsonBody({
    req: {
      json: async () => {
        throw new Error('broken')
      },
    },
  } as unknown as Pick<Context, 'req'>)

  assert.deepEqual(parsed, { prompt: 'scene' })
  assert.deepEqual(arrayResult, {})
  assert.deepEqual(failedResult, {})
})

await runTest('hasOwn only reports own properties', () => {
  const body = Object.create({ inherited: true }) as Record<string, unknown>
  body.own = 'present'

  assert.equal(hasOwn(body, 'own'), true)
  assert.equal(hasOwn(body, 'inherited'), false)
})

await runTest('readBodyText reads the first string alias and trims it', () => {
  assert.equal(readBodyText({ title: '  scene  ' }, 'name', 'title'), 'scene')
  assert.equal(readBodyText({ name: 7, title: 'fallback' }, 'name', 'title'), 'fallback')
  assert.equal(readBodyText({ name: null }, 'name'), '')
})

await runTest('readBodyId reads finite numeric aliases', () => {
  assert.equal(readBodyId({ drama_id: ' 42 ' }, 'drama_id', 'dramaId'), 42)
  assert.equal(readBodyId({ drama_id: Number.NaN, dramaId: 9 }, 'drama_id', 'dramaId'), 9)
  assert.equal(readBodyId({ drama_id: 'nope' }, 'drama_id'), 0)
})
