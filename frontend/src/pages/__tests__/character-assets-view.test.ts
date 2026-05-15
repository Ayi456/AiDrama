import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.resolve(__dirname, '../CharacterAssetsView.vue'), 'utf8')

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('character asset cards expose a dedicated image preview action', () => {
  assert.match(source, /@open-preview="openPreview"/)
  assert.match(source, /emits:\s*\['edit', 'delete', 'open-preview'\]/)
  assert.match(source, /title:\s*'放大预览'/)
  assert.match(source, /emit\('open-preview'/)
})

runTest('character asset image preview renders a closeable large-image overlay', () => {
  assert.match(source, /v-if="previewImage\.open && previewImage\.src"/)
  assert.match(source, /class="character-assets__preview"/)
  assert.match(source, /@click\.self="closePreview"/)
  assert.match(source, /function closePreview\(\)/)
})
