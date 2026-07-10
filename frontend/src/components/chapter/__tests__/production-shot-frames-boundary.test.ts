import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const component = readFileSync(
  fileURLToPath(new URL('../ProductionShotFrames.vue', import.meta.url)),
  'utf8',
)
const styles = readFileSync(
  fileURLToPath(new URL('../../../assets/production-shot-workbench.css', import.meta.url)),
  'utf8',
)

assert.match(component, /v-for="card in selectedResultCards"/)
assert.doesNotMatch(component, /\bframeCards\b/)
assert.doesNotMatch(component, /class="frame-gallery"/)
assert.doesNotMatch(styles, /\.frame-gallery\b|\.frame-card(?:\b|__)/)

console.log('PASS shot frame workbench has no stale gallery boundary')
