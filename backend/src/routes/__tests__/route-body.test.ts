import assert from 'node:assert/strict'
import type { Context } from 'hono'

import { hasOwn, readJsonBody } from '../route-body.js'

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
