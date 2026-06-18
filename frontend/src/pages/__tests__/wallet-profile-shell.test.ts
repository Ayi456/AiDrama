import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(__dirname, '../..')
const routerSource = fs.readFileSync(path.resolve(srcRoot, 'router.ts'), 'utf8')
const defaultLayoutSource = fs.readFileSync(path.resolve(srcRoot, 'layouts/default.vue'), 'utf8')
const walletViewSource = fs.readFileSync(path.resolve(srcRoot, 'pages/WalletView.vue'), 'utf8')

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

runTest('wallet page uses customer-facing payment and ledger copy', () => {
  assert.match(walletViewSource, /支持整数或小数金额，支付完成后余额会自动更新/)
  assert.match(walletViewSource, /充值金额为 1 到 9999 元/)
  assert.match(walletViewSource, /查看充值记录和未完成订单/)
  assert.match(walletViewSource, /每一笔充值和视频扣费都会保留记录/)
  assert.doesNotMatch(walletViewSource, /异步通知/)
  assert.doesNotMatch(walletViewSource, /独立分页/)
})

