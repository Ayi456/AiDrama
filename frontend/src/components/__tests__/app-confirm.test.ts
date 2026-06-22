import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const componentSource = fs.readFileSync(path.resolve(__dirname, '../AppConfirm.vue'), 'utf8')
const appSource = fs.readFileSync(path.resolve(__dirname, '../../App.vue'), 'utf8')
const studioStyles = fs.readFileSync(path.resolve(__dirname, '../../assets/studio.css'), 'utf8')

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('AppConfirm is mounted globally from App.vue', () => {
  assert.match(appSource, /<AppConfirm \/>/)
  assert.match(appSource, /import AppConfirm from '\.\/components\/AppConfirm\.vue'/)
})

runTest('AppConfirm renders as a centered confirmation dialog for destructive actions', () => {
  const hostBlock = componentSource.match(/\.app-confirm-host\s*\{[^}]+\}/)?.[0] || ''
  assert.match(componentSource, /class="app-confirm-host"/)
  assert.match(hostBlock, /position:\s*fixed/)
  assert.match(hostBlock, /inset:\s*0/)
  assert.match(hostBlock, /align-items:\s*center/)
  assert.match(hostBlock, /justify-content:\s*center/)
  assert.match(componentSource, /class="app-confirm-backdrop"/)
})

runTest('App.vue positions lightweight toast notifications at the top-right', () => {
  assert.match(appSource, /<Toaster position="top-right"/)
})

runTest('global toasts use polished product feedback styling', () => {
  assert.match(studioStyles, /--toast-success/)
  assert.match(studioStyles, /\[data-sonner-toast\]::after/)
  assert.match(studioStyles, /@keyframes toastProgress/)
  assert.match(studioStyles, /prefers-reduced-motion:\s*reduce/)
  assert.match(studioStyles, /data-sonner-toast\]\s*\[data-close-button\]:focus-visible/)
})
