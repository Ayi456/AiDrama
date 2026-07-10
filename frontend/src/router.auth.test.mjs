import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const routerSource = readFileSync(resolve('src/router.ts'), 'utf8')
const apiFacadeSource = readFileSync(resolve('src/composables/useApi.ts'), 'utf8')
const authApiSource = readFileSync(resolve('src/api/auth.ts'), 'utf8')
const apiClientSource = readFileSync(resolve('src/api/client.ts'), 'utf8')
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
  assert.match(apiFacadeSource, /export \{ authAPI, uploadAPI \}/)
  assert.match(authApiSource, /export const authAPI/)
  assert.match(authApiSource, /login:/)
  assert.match(authApiSource, /register:/)
  assert.match(authApiSource, /session:/)
  assert.match(authApiSource, /sendRegisterCode:/)
  assert.match(authApiSource, /logout:/)
})

runTest('API requests include HttpOnly cookie credentials', () => {
  assert.match(apiClientSource, /credentials:\s*['"]include['"]/)
  assert.doesNotMatch(apiClientSource, /Authorization\s*=/)
  assert.doesNotMatch(apiClientSource, /readAuthTokenFromStorage/)
})

runTest('app startup validates stored auth before mounting', () => {
  assert.match(mainSource, /validateStoredAuthSession/)
  assert.match(mainSource, /await\s+validateStoredAuthSession\(\)/)
})
