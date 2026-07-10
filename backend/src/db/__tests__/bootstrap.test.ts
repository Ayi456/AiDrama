import assert from 'node:assert/strict'

import { createIdempotentInitializer } from '../bootstrap.js'

let calls = 0
let release!: () => void
const gate = new Promise<void>((resolve) => {
  release = resolve
})
const ensureReady = createIdempotentInitializer(async () => {
  calls += 1
  await gate
})

const first = ensureReady()
const second = ensureReady()
assert.strictEqual(first, second)
assert.equal(calls, 1)

release()
await Promise.all([first, second])
await ensureReady()
assert.equal(calls, 1)

console.log('PASS database bootstrap is idempotent')
