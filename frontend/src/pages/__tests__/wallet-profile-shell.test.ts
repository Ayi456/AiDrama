import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(__dirname, '../..')
const routerSource = fs.readFileSync(path.resolve(srcRoot, 'router.ts'), 'utf8')
const defaultLayoutSource = fs.readFileSync(path.resolve(srcRoot, 'layouts/default.vue'), 'utf8')

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('router exposes authenticated profile and wallet routes', () => {
  assert.match(routerSource, /path:\s*['"]\/profile['"]/)
  assert.match(routerSource, /path:\s*['"]\/wallet['"]/)
  assert.match(routerSource, /name:\s*['"]profile['"]/)
  assert.match(routerSource, /name:\s*['"]wallet['"]/)
})

runTest('default layout exposes wallet navigation and profile entry', () => {
  assert.match(defaultLayoutSource, /to="\/wallet"/)
  assert.match(defaultLayoutSource, /钱包/)
  assert.match(defaultLayoutSource, /router\.push\('\/profile'\)/)
})

