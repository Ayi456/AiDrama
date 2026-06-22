import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(path.resolve(__dirname, '../ProductionCharacterGallery.vue'), 'utf8')
const styles = fs.readFileSync(path.resolve(__dirname, '../../../assets/production-character-gallery.css'), 'utf8')
const panel = fs.readFileSync(path.resolve(__dirname, '../ChapterProductionPanel.vue'), 'utf8')
const page = fs.readFileSync(path.resolve(__dirname, '../../../pages/ChapterStudioView.vue'), 'utf8')

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('character cards expose an image-to-image reference upload like scene cards', () => {
  assert.match(source, /class="character-gallery__reference"/)
  assert.match(source, /handleReferenceFile\(character, \$event\)/)
  assert.match(source, /clearReference\(character\)/)
  assert.match(source, /getAssetReferenceImage/)
  assert.match(source, /图生图/)
  assert.match(styles, /\.character-gallery__reference\s*{/)
})

runTest('character reference upload is wired through the production panel to the page handler', () => {
  assert.match(source, /'clear-character-reference'/)
  assert.match(source, /referenceOnly:\s*true/)
  assert.match(panel, /@clear-character-reference="handlers\.handleCharacterReferenceClear"/)
  assert.match(page, /async function handleCharacterReferenceClear/)
  assert.match(page, /reference_image:\s*uploaded\.url/)
  assert.match(page, /characterAPI\.bindAsset/)
})
