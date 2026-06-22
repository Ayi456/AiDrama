import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.resolve(__dirname, '../CharacterAssetsView.vue'), 'utf8')
const styles = fs.readFileSync(path.resolve(__dirname, '../../assets/character-assets.css'), 'utf8')

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

runTest('character assets page owns scrolling inside the app shell', () => {
  assert.match(styles, /\.character-assets\.page\s*{[^}]*height:\s*100%;[^}]*overflow-y:\s*auto;/s)
})

runTest('character assets page exposes a richer library summary', () => {
  assert.match(source, /class="character-assets__summary"/)
  assert.match(source, /{{ assets\.length }}/)
  assert.match(source, /{{ defaultAssetCount }}/)
  assert.match(source, /{{ visibleAssetCount }}/)
})

runTest('character assets editor does not expose image-to-image reference controls', () => {
  assert.doesNotMatch(source, /class="character-assets__reference"/)
  assert.doesNotMatch(source, /handleReferenceFileChange/)
  assert.doesNotMatch(source, /clearReferenceImage/)
  assert.doesNotMatch(source, /图生图|鍥剧敓鍥?/)
  assert.doesNotMatch(styles, /\.character-assets__reference/)
})

runTest('character asset cards do not trigger image-to-image generation', () => {
  assert.doesNotMatch(source, /@generate="generateAssetImage"/)
  assert.doesNotMatch(source, /characterAssetAPI\.generateImage/)
  assert.doesNotMatch(source, /isGeneratingAssetImage/)
  assert.doesNotMatch(source, /referenceImageSource/)
})
