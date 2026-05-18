import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('studio navigation avoids loose any types', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../useChapterStudioNavigation.ts', import.meta.url)),
    'utf8',
  )

  assert.equal(/\bany\b/.test(source), false)
})
