import assert from 'node:assert/strict'

import {
  buildRechargeOrderNo,
  resolvePaymentOrderAction,
  resolveAlipayNotifyDecision,
} from '../payments/payment-orders.js'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('buildRechargeOrderNo creates recharge-scoped order numbers', () => {
  const orderNo = buildRechargeOrderNo(new Date('2026-06-17T02:30:45.000Z'), () => '1234')
  assert.match(orderNo, /^R202606170230451234$/)
})

runTest('resolveAlipayNotifyDecision fails when signature verification fails', () => {
  assert.deepEqual(resolveAlipayNotifyDecision({
    verified: false,
    order: {
      orderNo: 'R1',
      amount: '10.00',
      status: 'pending',
    },
    params: {
      out_trade_no: 'R1',
      trade_status: 'TRADE_SUCCESS',
      total_amount: '10.00',
    },
  }), { action: 'fail', reason: 'invalid_signature' })
})

runTest('resolveAlipayNotifyDecision treats paid orders as idempotent success', () => {
  assert.deepEqual(resolveAlipayNotifyDecision({
    verified: true,
    order: {
      orderNo: 'R1',
      amount: '10.00',
      status: 'paid',
    },
    params: {
      out_trade_no: 'R1',
      trade_status: 'TRADE_SUCCESS',
      total_amount: '10.00',
    },
  }), { action: 'success', reason: 'already_paid' })
})

runTest('resolveAlipayNotifyDecision rejects amount mismatches before crediting balance', () => {
  assert.deepEqual(resolveAlipayNotifyDecision({
    verified: true,
    order: {
      orderNo: 'R1',
      amount: '10.00',
      status: 'pending',
    },
    params: {
      out_trade_no: 'R1',
      trade_status: 'TRADE_SUCCESS',
      total_amount: '9.99',
    },
  }), { action: 'fail', reason: 'amount_mismatch' })
})

runTest('resolveAlipayNotifyDecision allows only successful Alipay trade statuses to credit balance', () => {
  assert.deepEqual(resolveAlipayNotifyDecision({
    verified: true,
    order: {
      orderNo: 'R1',
      amount: '10.00',
      status: 'pending',
    },
    params: {
      out_trade_no: 'R1',
      trade_status: 'WAIT_BUYER_PAY',
      total_amount: '10.00',
    },
  }), { action: 'fail', reason: 'trade_not_success' })

  assert.deepEqual(resolveAlipayNotifyDecision({
    verified: true,
    order: {
      orderNo: 'R1',
      amount: '10.00',
      status: 'pending',
    },
    params: {
      out_trade_no: 'R1',
      trade_status: 'TRADE_FINISHED',
      total_amount: '10.00',
    },
  }), { action: 'credit', reason: 'paid' })
})

runTest('resolvePaymentOrderAction allows continuing and canceling only pending orders', () => {
  assert.deepEqual(resolvePaymentOrderAction({ status: 'pending' }, 'continue_pay'), { allowed: true })
  assert.deepEqual(resolvePaymentOrderAction({ status: 'pending' }, 'cancel'), { allowed: true })
  assert.deepEqual(resolvePaymentOrderAction({ status: 'paid' }, 'continue_pay'), {
    allowed: false,
    reason: 'order_already_paid',
  })
  assert.deepEqual(resolvePaymentOrderAction({ status: 'closed' }, 'continue_pay'), {
    allowed: false,
    reason: 'order_not_payable',
  })
  assert.deepEqual(resolvePaymentOrderAction({ status: 'paid' }, 'cancel'), {
    allowed: false,
    reason: 'order_already_paid',
  })
  assert.deepEqual(resolvePaymentOrderAction({ status: 'closed' }, 'cancel'), {
    allowed: false,
    reason: 'order_not_cancelable',
  })
  assert.deepEqual(resolvePaymentOrderAction(null, 'cancel'), {
    allowed: false,
    reason: 'order_not_found',
  })
})
