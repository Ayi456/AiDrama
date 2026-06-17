import { Hono } from 'hono'

import { getCurrentUser } from '../../middleware/auth.js'
import { badRequest, created, success } from '../../utils/response.js'
import {
  cancelPaymentOrderForUser,
  continuePaymentOrderForUser,
  createRechargeOrder,
  getPaymentOrderForUser,
  handleAlipayNotify,
  listPaymentOrdersForUser,
} from '../../services/payments/payment-orders.js'
import { readWalletListLimit } from '../policies/wallet-route-policy.js'

const app = new Hono()

app.post('/recharge-orders', async (c) => {
  const currentUser = getCurrentUser(c)
  const body = await c.req.json().catch(() => ({})) as { amount?: string }
  if (!body.amount) return badRequest(c, '充值金额不能为空')

  try {
    return created(c, await createRechargeOrder(currentUser.id, body.amount))
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : '创建充值订单失败')
  }
})

app.get('/orders', async (c) => {
  const currentUser = getCurrentUser(c)
  const limit = readWalletListLimit(c.req.query('limit'))
  return success(c, { items: await listPaymentOrdersForUser(currentUser.id, limit) })
})

app.get('/orders/:orderNo', async (c) => {
  const currentUser = getCurrentUser(c)
  const order = await getPaymentOrderForUser(currentUser.id, c.req.param('orderNo'))
  return success(c, order)
})

app.post('/orders/:orderNo/pay', async (c) => {
  const currentUser = getCurrentUser(c)
  try {
    return success(c, await continuePaymentOrderForUser(currentUser.id, c.req.param('orderNo')))
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : '继续支付失败')
  }
})

app.post('/orders/:orderNo/cancel', async (c) => {
  const currentUser = getCurrentUser(c)
  try {
    return success(c, await cancelPaymentOrderForUser(currentUser.id, c.req.param('orderNo')))
  } catch (error) {
    return badRequest(c, error instanceof Error ? error.message : '取消支付失败')
  }
})

app.post('/alipay/notify', async (c) => {
  const body = await c.req.parseBody().catch(() => ({}))
  const query = Object.fromEntries(new URL(c.req.url).searchParams.entries())
  const result = await handleAlipayNotify({ ...body, ...query })
  return c.text(result)
})

app.get('/alipay/return', (c) => {
  const orderNo = c.req.query('out_trade_no') || ''
  const suffix = orderNo ? `?orderNo=${encodeURIComponent(orderNo)}` : ''
  return c.redirect(`/wallet${suffix}`, 302)
})

export default app
