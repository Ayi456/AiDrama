import { Hono } from 'hono'
import type { RowDataPacket } from 'mysql2/promise'

import { mysqlPool } from '../../db/index.js'
import { getCurrentUser } from '../../middleware/auth.js'
import { success } from '../../utils/response.js'
import { getVideoPricePerSecond } from '../../services/billing/billing-settings.js'
import { getOrCreateWallet, getWalletTransactions } from '../../services/billing/wallet.js'
import { readWalletListLimit, shouldExposePendingSettlement } from '../policies/wallet-route-policy.js'
import { toMoney } from '../../services/billing/money.js'

const app = new Hono()

type PendingSettlementRow = RowDataPacket & {
  id: number
  storyboard_id: number | null
  title: string | null
  pending_duration_seconds: string | null
  billing_amount: string | null
  billed_seconds: string | null
  billing_status: string | null
  status: string | null
  duration: number | null
  created_at: string | null
}

app.get('/', async (c) => {
  const currentUser = getCurrentUser(c)
  const [wallet, videoPricePerSecond] = await Promise.all([
    getOrCreateWallet(currentUser.id),
    getVideoPricePerSecond(),
  ])
  return success(c, {
    balance: wallet.balance,
    totalRecharged: wallet.totalRecharged,
    totalConsumed: wallet.totalConsumed,
    videoPricePerSecond,
  })
})

app.get('/transactions', async (c) => {
  const currentUser = getCurrentUser(c)
  const limit = readWalletListLimit(c.req.query('limit'))
  return success(c, { items: await getWalletTransactions(currentUser.id, limit) })
})

app.get('/video-price', async (c) => {
  return success(c, { videoPricePerSecond: await getVideoPricePerSecond() })
})

app.get('/pending-settlements', async (c) => {
  const currentUser = getCurrentUser(c)
  const limit = readWalletListLimit(c.req.query('limit'))
  const [rows] = await mysqlPool.execute<PendingSettlementRow[]>(
    `SELECT vg.id,
            vg.storyboard_id,
            sb.title,
            vg.pending_duration_seconds,
            vg.billing_amount,
            vg.billed_seconds,
            vg.billing_status,
            vg.status,
            vg.duration,
            vg.created_at
       FROM video_generations vg
       LEFT JOIN storyboards sb ON sb.id = vg.storyboard_id
       LEFT JOIN episodes ep ON ep.id = sb.episode_id
       LEFT JOIN dramas sd ON sd.id = ep.drama_id
       LEFT JOIN dramas d ON d.id = vg.drama_id
      WHERE (
            vg.billing_status IN ('billing', 'billing_required', 'billing_failed')
            OR (vg.billing_status = 'unbilled' AND vg.status IN ('pending', 'processing', 'checking_defect'))
          )
        AND (vg.user_id = ? OR d.user_id = ? OR sd.user_id = ?)
      ORDER BY vg.updated_at DESC, vg.id DESC
      LIMIT ${limit}`,
    [currentUser.id, currentUser.id, currentUser.id],
  )

  return success(c, {
    items: rows
      .filter(row => shouldExposePendingSettlement({
        billingStatus: row.billing_status,
        generationStatus: row.status,
      }))
      .map(row => ({
        videoGenerationId: Number(row.id),
        storyboardId: row.storyboard_id == null ? undefined : Number(row.storyboard_id),
        title: row.title || undefined,
        durationSeconds: toMoney(row.pending_duration_seconds || row.billed_seconds || row.duration || '0.00'),
        amountDue: toMoney(row.billing_amount || '0.00'),
        billingStatus: row.billing_status || 'unbilled',
        generationStatus: row.status || undefined,
        createdAt: row.created_at || undefined,
      })),
  })
})

export default app
