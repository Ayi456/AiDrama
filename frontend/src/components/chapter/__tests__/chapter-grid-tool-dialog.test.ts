import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const parent = readFileSync(
  fileURLToPath(new URL('../ProductionShotFrames.vue', import.meta.url)),
  'utf8',
)
const dialog = readFileSync(
  fileURLToPath(new URL('../ChapterGridToolDialog.vue', import.meta.url)),
  'utf8',
)

assert.match(parent, /<ChapterGridToolDialog/)
assert.equal(parent.includes('class="card grid-tool"'), false)
assert.match(dialog, /class="card grid-tool"/)
assert.match(dialog, /defineEmits/)

console.log('PASS grid dialog has a focused component boundary')
