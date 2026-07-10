import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { paymentAPI, walletAPI } from '../../api/billing.ts'
import {
  agentConfigAPI,
  aiConfigAPI,
  automationAPI,
  preferencesAPI,
  skillsAPI,
} from '../../api/configuration.ts'
import * as facade from '../useApi.ts'

assert.strictEqual(facade.walletAPI, walletAPI)
assert.strictEqual(facade.paymentAPI, paymentAPI)
assert.strictEqual(facade.aiConfigAPI, aiConfigAPI)
assert.strictEqual(facade.agentConfigAPI, agentConfigAPI)
assert.strictEqual(facade.skillsAPI, skillsAPI)
assert.strictEqual(facade.preferencesAPI, preferencesAPI)
assert.strictEqual(facade.automationAPI, automationAPI)

const source = readFileSync(fileURLToPath(new URL('../useApi.ts', import.meta.url)), 'utf8')
assert.equal(source.includes('fetch('), false)
assert.equal(source.split(/\r?\n/).length < 80, true)
console.log('PASS useApi remains a thin compatibility facade')
