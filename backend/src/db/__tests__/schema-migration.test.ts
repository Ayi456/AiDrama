import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbIndexSourcePath = [
  path.resolve(__dirname, '../index.ts'),
  path.resolve(__dirname, '../index.js'),
].find(candidate => fs.existsSync(candidate))

if (!dbIndexSourcePath) {
  throw new Error('Unable to locate compiled or source db/index file')
}

const dbIndexSource = fs.readFileSync(dbIndexSourcePath, 'utf8')

runTest('image generation provider usage columns are backfilled for existing MySQL tables', () => {
  for (const column of [
    'provider_usage_completion_tokens',
    'provider_usage_total_tokens',
    'provider_usage_raw',
  ]) {
    assert.match(
      dbIndexSource,
      new RegExp(`ensureColumn\\(pool, database, 'image_generations', '${column}',`),
    )
  }
})
