import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { videoGenerations } from '../schema.js'

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
const migrationSourcePath = [
  path.resolve(__dirname, '../migrations.ts'),
  path.resolve(__dirname, '../migrations.js'),
].find(candidate => fs.existsSync(candidate))

if (!migrationSourcePath) {
  throw new Error('Unable to locate compiled or source db/migrations file')
}

const migrationSource = fs.readFileSync(migrationSourcePath, 'utf8')

runTest('image generation provider usage columns are backfilled for existing MySQL tables', () => {
  for (const column of [
    'provider_usage_completion_tokens',
    'provider_usage_total_tokens',
    'provider_usage_raw',
  ]) {
    assert.match(
      migrationSource,
      new RegExp(`ensureColumn\\(pool, database, 'image_generations', '${column}',`),
    )
  }
})

runTest('video generation provider usage columns are available to Drizzle patches', () => {
  const columns = videoGenerations as unknown as Record<string, { name: string } | undefined>

  assert.equal(columns.providerUsageCompletionTokens?.name, 'provider_usage_completion_tokens')
  assert.equal(columns.providerUsageTotalTokens?.name, 'provider_usage_total_tokens')
  assert.equal(columns.providerUsageRaw?.name, 'provider_usage_raw')
})
