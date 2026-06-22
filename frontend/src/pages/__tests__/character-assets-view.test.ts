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
  assert.match(source, /emits:\s*\['edit', 'delete', 'open-preview', 'generate'\]/)
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

runTest('character assets editor supports reference images for image-to-image generation', () => {
  assert.match(source, /class="character-assets__reference"/)
  assert.match(source, /reference_image/)
  assert.match(source, /handleReferenceFileChange/)
  assert.match(source, /clearReferenceImage/)
  assert.match(source, /图生图|鍥剧敓鍥?/)
})

runTest('character asset cards can trigger image-to-image generation from a reference image', () => {
  assert.match(source, /@generate="generateAssetImage"/)
  assert.match(source, /characterAssetAPI\.generateImage/)
  assert.match(source, /isGeneratingAssetImage/)
  assert.match(source, /referenceImageSource/)
})
