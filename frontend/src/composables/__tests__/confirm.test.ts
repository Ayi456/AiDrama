import assert from 'node:assert/strict'

import {
  confirmState,
  requestConfirm,
  resolveConfirm,
} from '../useConfirm.ts'

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

await runTest('requestConfirm opens a reusable confirmation prompt and resolves true', async () => {
  const result = requestConfirm({
    title: '删除项目',
    message: '确定删除「天魔系统5」？此操作不可恢复。',
    confirmText: '删除',
    variant: 'danger',
  })

  assert.equal(confirmState.open, true)
  assert.equal(confirmState.title, '删除项目')
  assert.equal(confirmState.message, '确定删除「天魔系统5」？此操作不可恢复。')
  assert.equal(confirmState.confirmText, '删除')
  assert.equal(confirmState.cancelText, '取消')
  assert.equal(confirmState.variant, 'danger')

  resolveConfirm(true)

  assert.equal(await result, true)
  assert.equal(confirmState.open, false)
})

await runTest('requestConfirm resolves false when cancelled', async () => {
  const result = requestConfirm({
    title: '删除镜头',
    message: '确定删除此镜头？',
  })

  assert.equal(confirmState.open, true)

  resolveConfirm(false)

  assert.equal(await result, false)
  assert.equal(confirmState.open, false)
})
