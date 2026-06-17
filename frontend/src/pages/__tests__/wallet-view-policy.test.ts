import assert from 'node:assert/strict'

import {
  formatMoney,
  getBillingStatusMeta,
  getOrderStatusMeta,
  getPaymentOrderActions,
  getPendingSettlementMeta,
  getPendingSettlementSummary,
  getTransactionTone,
  hasPendingPaymentOrders,
  isPendingSettlementRetryable,
  isValidRechargeAmount,
  normalizeRechargeAmountInput,
  upsertPaymentOrder,
} from '../wallet-view-policy.ts'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('recharge amount validation accepts flexible yuan input and normalizes it', () => {
  assert.equal(normalizeRechargeAmountInput('1'), '1.00')
  assert.equal(normalizeRechargeAmountInput('1.0'), '1.00')
  assert.equal(normalizeRechargeAmountInput('1.01'), '1.01')
  assert.equal(normalizeRechargeAmountInput(' 100 '), '100.00')
  assert.equal(normalizeRechargeAmountInput('0.99'), null)
  assert.equal(normalizeRechargeAmountInput('10000'), null)
  assert.equal(normalizeRechargeAmountInput('1.234'), null)

  assert.equal(isValidRechargeAmount('1'), true)
  assert.equal(isValidRechargeAmount('1.0'), true)
  assert.equal(isValidRechargeAmount('10.00'), true)
  assert.equal(isValidRechargeAmount('0.99'), false)
  assert.equal(isValidRechargeAmount('abc'), false)
})

runTest('money formatting always renders two decimals', () => {
  assert.equal(formatMoney('8'), '8.00')
  assert.equal(formatMoney('8.5'), '8.50')
  assert.equal(formatMoney('-8'), '-8.00')
  assert.equal(formatMoney('bad'), '0.00')
})

runTest('order status labels match payment state', () => {
  assert.deepEqual(getOrderStatusMeta('pending'), { label: '等待支付', tone: 'pending' })
  assert.deepEqual(getOrderStatusMeta('paid'), { label: '已到账', tone: 'success' })
  assert.deepEqual(getOrderStatusMeta('closed'), { label: '订单已关闭', tone: 'muted' })
})

runTest('pending payment orders expose continue and cancel actions', () => {
  assert.deepEqual(getPaymentOrderActions({ status: 'pending' }), {
    canContinuePay: true,
    canCancel: true,
  })
  assert.deepEqual(getPaymentOrderActions({ status: 'paid' }), {
    canContinuePay: false,
    canCancel: false,
  })
  assert.deepEqual(getPaymentOrderActions({ status: 'closed' }), {
    canContinuePay: false,
    canCancel: false,
  })
})

runTest('pending orders trigger wallet order refresh polling', () => {
  assert.equal(hasPendingPaymentOrders([{ status: 'paid' }, { status: 'closed' }]), false)
  assert.equal(hasPendingPaymentOrders([{ status: 'paid' }, { status: 'pending' }]), true)
  assert.equal(hasPendingPaymentOrders([]), false)
})

runTest('upsertPaymentOrder inserts new pending orders and replaces existing rows', () => {
  assert.deepEqual(
    upsertPaymentOrder([{ orderNo: 'R1', status: 'paid' }], { orderNo: 'R2', status: 'pending' }),
    [{ orderNo: 'R2', status: 'pending' }, { orderNo: 'R1', status: 'paid' }],
  )
  assert.deepEqual(
    upsertPaymentOrder([{ orderNo: 'R1', status: 'pending' }], { orderNo: 'R1', status: 'closed' }),
    [{ orderNo: 'R1', status: 'closed' }],
  )
})

runTest('transaction tone separates recharge income from video charges', () => {
  assert.equal(getTransactionTone({ type: 'recharge', amount: '100.00' }), 'income')
  assert.equal(getTransactionTone({ type: 'video_charge', amount: '-8.00' }), 'expense')
})

runTest('billing status meta highlights required recharge action', () => {
  assert.deepEqual(getBillingStatusMeta('billing_required'), {
    label: '余额不足',
    tone: 'warning',
    action: '充值后继续结算',
  })
  assert.deepEqual(getBillingStatusMeta('settled'), {
    label: '已结算',
    tone: 'success',
    action: '',
  })
})

runTest('in-flight pending settlements are visible but not retryable', () => {
  const generating = {
    billingStatus: 'unbilled',
    generationStatus: 'processing',
    durationSeconds: '15.00',
    amountDue: '0.00',
  }
  assert.deepEqual(getPendingSettlementMeta(generating), {
    label: '生成中',
    tone: 'info',
    action: '',
  })
  assert.equal(getPendingSettlementSummary(generating), '15.00 秒，完成后按实际生成时长扣费')
  assert.equal(isPendingSettlementRetryable(generating), false)

  const required = {
    billingStatus: 'billing_required',
    generationStatus: 'billing_required',
    durationSeconds: '15.00',
    amountDue: '0.00',
  }
  assert.equal(getPendingSettlementMeta(required).action, '充值后继续结算')
  assert.equal(isPendingSettlementRetryable(required), true)
})
