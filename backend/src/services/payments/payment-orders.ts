import type { PoolConnection, RowDataPacket } from 'mysql2/promise'

import { now } from '../../utils/response.js'
import { assertRechargeAmount, toMoney, type MoneyString } from '../billing/money.js'
import { creditWalletForRecharge } from '../billing/wallet.js'
import { createAlipayPagePayForm, verifyAlipayNotify } from './alipay.js'

export type PaymentOrderStatus = 'pending' | 'paid' | 'failed' | 'closed'

export type PaymentOrder = {
  id: number
  orderNo: string
  userId: number
  amount: MoneyString
  status: PaymentOrderStatus
  provider: 'alipay'
  alipayTradeNo: string | null
  alipayAppId: string | null
  alipaySellerId: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
}

export type CreateRechargeOrderResult = {
  orderNo: string
  amount: MoneyString
  paymentFormHtml: string
}

export type AlipayNotifyDecision =
  | { action: 'credit'; reason: 'paid' }
  | { action: 'success'; reason: 'already_paid' }
  | { action: 'fail'; reason: 'invalid_signature' | 'order_not_found' | 'order_mismatch' | 'amount_mismatch' | 'trade_not_success' }

export type PaymentOrderAction = 'continue_pay' | 'cancel'
export type PaymentOrderActionDecision =
  | { allowed: true }
  | { allowed: false; reason: 'order_not_found' | 'order_already_paid' | 'order_not_payable' | 'order_not_cancelable' }

type PaymentOrderRow = RowDataPacket & {
  id: number
  order_no: string
  user_id: number
  amount: string
  status: PaymentOrderStatus
  provider: 'alipay'
  alipay_trade_no: string | null
  alipay_app_id: string | null
  alipay_seller_id: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

export function buildRechargeOrderNo(date = new Date(), random = () => Math.floor(Math.random() * 10000).toString().padStart(4, '0')) {
  const stamp = date.toISOString().replace(/\D/g, '').slice(0, 14)
  return `R${stamp}${random()}`
}

function notifyParam(params: Record<string, unknown>, key: string) {
  const value = params[key]
  return typeof value === 'string' ? value : String(value ?? '')
}

function isPaidTradeStatus(value: string) {
  return value === 'TRADE_SUCCESS' || value === 'TRADE_FINISHED'
}

export function resolveAlipayNotifyDecision(input: {
  verified: boolean
  order: Pick<PaymentOrder, 'orderNo' | 'amount' | 'status'> | null
  params: Record<string, unknown>
}): AlipayNotifyDecision {
  if (!input.verified) return { action: 'fail', reason: 'invalid_signature' }
  if (!input.order) return { action: 'fail', reason: 'order_not_found' }

  const orderNo = notifyParam(input.params, 'out_trade_no')
  if (orderNo !== input.order.orderNo) return { action: 'fail', reason: 'order_mismatch' }
  if (input.order.status === 'paid') return { action: 'success', reason: 'already_paid' }

  const totalAmount = toMoney(notifyParam(input.params, 'total_amount') || '0')
  if (totalAmount !== input.order.amount) return { action: 'fail', reason: 'amount_mismatch' }

  if (!isPaidTradeStatus(notifyParam(input.params, 'trade_status'))) {
    return { action: 'fail', reason: 'trade_not_success' }
  }

  return { action: 'credit', reason: 'paid' }
}

export function resolvePaymentOrderAction(
  order: Pick<PaymentOrder, 'status'> | null,
  action: PaymentOrderAction,
): PaymentOrderActionDecision {
  if (!order) return { allowed: false, reason: 'order_not_found' }
  if (order.status === 'paid') return { allowed: false, reason: 'order_already_paid' }
  if (order.status !== 'pending') {
    return {
      allowed: false,
      reason: action === 'continue_pay' ? 'order_not_payable' : 'order_not_cancelable',
    }
  }
  return { allowed: true }
}

function mapOrder(row: PaymentOrderRow): PaymentOrder {
  return {
    id: Number(row.id),
    orderNo: row.order_no,
    userId: Number(row.user_id),
    amount: toMoney(row.amount),
    status: row.status,
    provider: 'alipay',
    alipayTradeNo: row.alipay_trade_no,
    alipayAppId: row.alipay_app_id,
    alipaySellerId: row.alipay_seller_id,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function paymentBaseUrl() {
  return (process.env.PUBLIC_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:5679').replace(/\/+$/, '')
}

function buildRechargePaymentForm(orderNo: string, amount: MoneyString) {
  const baseUrl = paymentBaseUrl()
  return createAlipayPagePayForm({
    orderNo,
    amount,
    subject: `AiDrama balance recharge ${amount} yuan`,
    body: `AiDrama video generation balance recharge ${amount} yuan`,
    returnUrl: `${baseUrl}/api/v1/payments/alipay/return`,
    notifyUrl: `${baseUrl}/api/v1/payments/alipay/notify`,
  })
}

export async function createRechargeOrder(userId: number, amountValue: string): Promise<CreateRechargeOrderResult> {
  const { mysqlPool } = await import('../../db/index.js')
  const amount = assertRechargeAmount(amountValue)
  const orderNo = buildRechargeOrderNo()
  const baseUrl = paymentBaseUrl()
  const paymentFormHtml = createAlipayPagePayForm({
    orderNo,
    amount,
    subject: `AiDrama 余额充值 ${amount} 元`,
    body: `AiDrama 视频生成余额充值 ${amount} 元`,
    returnUrl: `${baseUrl}/api/v1/payments/alipay/return`,
    notifyUrl: `${baseUrl}/api/v1/payments/alipay/notify`,
  })
  const ts = now()
  await mysqlPool.execute(
    `INSERT INTO payment_orders (order_no, user_id, amount, status, provider, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', 'alipay', ?, ?)`,
    [orderNo, userId, amount, ts, ts],
  )
  return { orderNo, amount, paymentFormHtml }
}

export async function continuePaymentOrderForUser(userId: number, orderNo: string): Promise<CreateRechargeOrderResult> {
  const order = await getPaymentOrderForUser(userId, orderNo)
  const decision = resolvePaymentOrderAction(order, 'continue_pay')
  if (!decision.allowed) throw new Error(decision.reason)

  return {
    orderNo: order!.orderNo,
    amount: order!.amount,
    paymentFormHtml: buildRechargePaymentForm(order!.orderNo, order!.amount),
  }
}

export async function getPaymentOrderForUser(userId: number, orderNo: string): Promise<PaymentOrder | null> {
  const { mysqlPool } = await import('../../db/index.js')
  const [rows] = await mysqlPool.execute<PaymentOrderRow[]>(
    `SELECT id, order_no, user_id, amount, status, provider, alipay_trade_no,
            alipay_app_id, alipay_seller_id, paid_at, created_at, updated_at
       FROM payment_orders
      WHERE user_id = ? AND order_no = ?
      LIMIT 1`,
    [userId, orderNo],
  )
  return rows[0] ? mapOrder(rows[0]) : null
}

export async function listPaymentOrdersForUser(userId: number, limit = 20): Promise<PaymentOrder[]> {
  const { mysqlPool } = await import('../../db/index.js')
  const safeLimit = Math.min(Math.max(Math.floor(Number(limit)) || 20, 1), 100)
  const [rows] = await mysqlPool.execute<PaymentOrderRow[]>(
    `SELECT id, order_no, user_id, amount, status, provider, alipay_trade_no,
            alipay_app_id, alipay_seller_id, paid_at, created_at, updated_at
       FROM payment_orders
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ${safeLimit}`,
    [userId],
  )
  return rows.map(mapOrder)
}

export async function cancelPaymentOrderForUser(userId: number, orderNo: string): Promise<PaymentOrder> {
  const { mysqlPool } = await import('../../db/index.js')
  const order = await getPaymentOrderForUser(userId, orderNo)
  const decision = resolvePaymentOrderAction(order, 'cancel')
  if (!decision.allowed) throw new Error(decision.reason)

  const ts = now()
  await mysqlPool.execute(
    `UPDATE payment_orders
        SET status = 'closed',
            updated_at = ?
      WHERE user_id = ?
        AND order_no = ?
        AND status = 'pending'`,
    [ts, userId, orderNo],
  )

  return {
    ...order!,
    status: 'closed',
    updatedAt: ts,
  }
}

async function loadOrderForUpdate(conn: PoolConnection, orderNo: string) {
  const [rows] = await conn.execute<PaymentOrderRow[]>(
    `SELECT id, order_no, user_id, amount, status, provider, alipay_trade_no,
            alipay_app_id, alipay_seller_id, paid_at, created_at, updated_at
       FROM payment_orders
      WHERE order_no = ?
      LIMIT 1
      FOR UPDATE`,
    [orderNo],
  )
  return rows[0] ? mapOrder(rows[0]) : null
}

export async function handleAlipayNotify(params: Record<string, unknown>): Promise<'success' | 'fail'> {
  const { mysqlPool } = await import('../../db/index.js')
  const verified = verifyAlipayNotify(params)
  const orderNo = notifyParam(params, 'out_trade_no')
  if (!orderNo) return 'fail'

  const conn = await mysqlPool.getConnection()
  try {
    await conn.beginTransaction()
    const order = await loadOrderForUpdate(conn, orderNo)
    const decision = resolveAlipayNotifyDecision({ verified, order, params })

    if (decision.action === 'fail') {
      await conn.rollback()
      return 'fail'
    }
    if (decision.action === 'success') {
      await conn.commit()
      return 'success'
    }

    const ts = now()
    await conn.execute(
      `UPDATE payment_orders
          SET status = 'paid',
              alipay_trade_no = ?,
              alipay_app_id = ?,
              alipay_seller_id = ?,
              raw_notify = ?,
              paid_at = ?,
              updated_at = ?
        WHERE order_no = ?`,
      [
        notifyParam(params, 'trade_no') || null,
        notifyParam(params, 'auth_app_id') || notifyParam(params, 'app_id') || null,
        notifyParam(params, 'seller_id') || null,
        JSON.stringify(params),
        ts,
        ts,
        orderNo,
      ],
    )

    await creditWalletForRecharge({
      userId: order!.userId,
      amount: order!.amount,
      orderNo,
      transactionNo: `WR${orderNo}`,
      description: `支付宝充值到账 ${order!.amount} 元`,
    }, { connection: conn })

    await conn.commit()
    return 'success'
  } catch (error) {
    await conn.rollback()
    console.error('[payments] failed to handle Alipay notify', error)
    return 'fail'
  } finally {
    conn.release()
  }
}
