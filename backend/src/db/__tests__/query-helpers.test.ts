import assert from 'node:assert/strict'

import {
  installQueryExecutionHelpers,
  normalizeMutationResult,
} from '../query-helpers.js'

type QueryWithHelpers = {
  all(): Promise<unknown>
  run(): Promise<unknown>
}

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('normalizeMutationResult exposes MySQL insertId as lastInsertRowid', () => {
  assert.deepEqual(
    normalizeMutationResult([{ insertId: 42, affectedRows: 1 }]),
    { insertId: 42, affectedRows: 1, lastInsertRowid: 42 },
  )
})

await runTest('normalizeMutationResult falls back to 0 when no insertId exists', () => {
  assert.deepEqual(
    normalizeMutationResult([{ affectedRows: 3 }]),
    { affectedRows: 3, lastInsertRowid: 0 },
  )
})

await runTest('installQueryExecutionHelpers adds all and run methods backed by execute', async () => {
  class Query {
    calls = 0

    async execute() {
      this.calls += 1
      return [{ insertId: 7, affectedRows: 1 }]
    }
  }

  const query = new Query()
  installQueryExecutionHelpers(query)
  const queryWithHelpers = query as Query & QueryWithHelpers

  assert.deepEqual(await queryWithHelpers.all(), [{ insertId: 7, affectedRows: 1 }])
  assert.deepEqual(await queryWithHelpers.run(), { insertId: 7, affectedRows: 1, lastInsertRowid: 7 })
  assert.equal(query.calls, 2)
})

await runTest('installQueryExecutionHelpers does not override existing helpers', async () => {
  class Query {
    async execute() {
      return [{ insertId: 1 }]
    }

    all() {
      return ['existing-all']
    }
  }

  const query = new Query()
  installQueryExecutionHelpers(query)
  const queryWithHelpers = query as Query & QueryWithHelpers

  assert.deepEqual(query.all(), ['existing-all'])
  assert.deepEqual(await queryWithHelpers.run(), { insertId: 1, lastInsertRowid: 1 })
})
