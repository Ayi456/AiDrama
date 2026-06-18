import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const routerSource = readFileSync(resolve('src/router.ts'), 'utf8')
const apiSource = readFileSync(resolve('src/composables/useApi.ts'), 'utf8')
const mainSource = readFileSync(resolve('src/main.ts'), 'utf8')

function runTest(name, fn) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('router exposes login and register routes', () => {
  assert.match(routerSource, /path:\s*['"]\/login['"]/)
  assert.match(routerSource, /path:\s*['"]\/register['"]/)
})

runTest('product routes require authentication', () => {
  assert.match(routerSource, /meta:\s*\{\s*requiresAuth:\s*true\s*\}/)
  assert.match(routerSource, /router\.beforeEach/)
})

runTest('authAPI exposes login, register, session and sms code calls', () => {
  assert.match(apiSource, /export const authAPI/)
  assert.match(apiSource, /login:/)
  assert.match(apiSource, /register:/)
  assert.match(apiSource, /session:/)
  assert.match(apiSource, /sendRegisterCode:/)
  assert.match(apiSource, /logout:/)
})

runTest('API requests include HttpOnly cookie credentials', () => {
  assert.match(apiSource, /credentials:\s*['"]include['"]/)
  assert.doesNotMatch(apiSource, /Authorization\s*=/)
  assert.doesNotMatch(apiSource, /readAuthTokenFromStorage/)
})

runTest('app startup validates stored auth before mounting', () => {
  assert.match(mainSource, /validateStoredAuthSession/)
  assert.match(mainSource, /await\s+validateStoredAuthSession\(\)/)
})
