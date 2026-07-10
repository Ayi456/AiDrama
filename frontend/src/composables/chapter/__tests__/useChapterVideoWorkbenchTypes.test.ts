import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const promptSource = readFileSync(
  fileURLToPath(new URL('../useChapterVideoPromptDrafts.ts', import.meta.url)),
  'utf8',
)
const referencesSource = readFileSync(
  fileURLToPath(new URL('../useChapterVideoReferences.ts', import.meta.url)),
  'utf8',
)

assert.match(promptSource, /export function useChapterVideoPromptDrafts/)
assert.match(referencesSource, /export function useChapterVideoReferences/)
assert.equal(/:\s*any\b|Record<string, any>/.test(promptSource + referencesSource), false)

console.log('PASS video workbench composables expose typed boundaries')
