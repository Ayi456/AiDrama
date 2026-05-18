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

runTest('grid tool avoids loose any types', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../useChapterGridTool.ts', import.meta.url)),
    'utf8',
  )

  assert.equal(/\bany\b|catch \(error: any\)|Record<string, any>/.test(source), false)
})
