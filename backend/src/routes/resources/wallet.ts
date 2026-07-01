import { Hono } from 'hono'
import type { RowDataPacket } from 'mysql2/promise'

import { mysqlPool } from '../../db/index.js'
import { getCurrentUser } from '../../middleware/auth.js'
import { success } from '../../utils/response.js'
import { getVideoPricePerSecond } from '../../services/billing/billing-settings.js'
import { countWalletTransactions, getOrCreateWallet, getWalletTransactions } from '../../services/billing/wallet.js'
import {
  buildPendingSettlementInFlightCutoffs,
  buildWalletPageMeta,
  buildWalletPaginatedPayload,
  readWalletPagination,
  shouldExposePendingSettlement,
} from '../policies/wallet-route-policy.js'
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
  task_id: string | null
  duration: number | null
  created_at: string | null
  updated_at: string | null
}

type CountRow = RowDataPacket & {
  total: number
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
  const pagination = readWalletPagination({
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
    limit: c.req.query('limit'),
  })
  const total = await countWalletTransactions(currentUser.id)
  const meta = buildWalletPageMeta(pagination, total)
  const items = await getWalletTransactions(currentUser.id, {
    pageSize: meta.pageSize,
    offset: meta.offset,
  })
  return success(c, buildWalletPaginatedPayload(items, meta))
})

app.get('/video-price', async (c) => {
  return success(c, { videoPricePerSecond: await getVideoPricePerSecond() })
})

app.get('/pending-settlements', async (c) => {
  const currentUser = getCurrentUser(c)
  const pagination = readWalletPagination({
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
    limit: c.req.query('limit'),
  })
  const cutoffs = buildPendingSettlementInFlightCutoffs()
  const lastTouchedSql = `COALESCE(NULLIF(vg.updated_at, ''), NULLIF(vg.created_at, ''))`
  const whereSql = `(vg.billing_status IN ('billing', 'billing_required', 'billing_failed')
          OR (
            vg.billing_status = 'unbilled'
            AND vg.status IN ('pending', 'processing', 'checking_defect')
            AND (
              ${lastTouchedSql} IS NULL
              OR (
                TRIM(COALESCE(vg.task_id, '')) = ''
                AND ${lastTouchedSql} >= ?
              )
              OR TRIM(COALESCE(vg.task_id, '')) <> ''
            )
          ))
        AND (vg.user_id = ? OR d.user_id = ? OR sd.user_id = ?)`
  const params = [
    cutoffs.withoutTaskUpdatedAfter,
    currentUser.id,
    currentUser.id,
    currentUser.id,
  ]
  const [countRows] = await mysqlPool.execute<CountRow[]>(
    `SELECT COUNT(*) AS total
       FROM video_generations vg
       LEFT JOIN storyboards sb ON sb.id = vg.storyboard_id
       LEFT JOIN episodes ep ON ep.id = sb.episode_id
       LEFT JOIN dramas sd ON sd.id = ep.drama_id
       LEFT JOIN dramas d ON d.id = vg.drama_id
      WHERE ${whereSql}`,
    params,
  )
  const meta = buildWalletPageMeta(pagination, countRows[0]?.total || 0)
  const [rows] = await mysqlPool.execute<PendingSettlementRow[]>(
    `SELECT vg.id,
            vg.storyboard_id,
            sb.title,
            vg.pending_duration_seconds,
            vg.billing_amount,
            vg.billed_seconds,
            vg.billing_status,
            vg.status,
            vg.task_id,
            vg.duration,
            vg.created_at,
            vg.updated_at
       FROM video_generations vg
       LEFT JOIN storyboards sb ON sb.id = vg.storyboard_id
       LEFT JOIN episodes ep ON ep.id = sb.episode_id
       LEFT JOIN dramas sd ON sd.id = ep.drama_id
       LEFT JOIN dramas d ON d.id = vg.drama_id
      WHERE ${whereSql}
      ORDER BY vg.updated_at DESC, vg.id DESC
      LIMIT ${meta.pageSize} OFFSET ${meta.offset}`,
    params,
  )

  return success(c, buildWalletPaginatedPayload(
    rows
      .filter(row => shouldExposePendingSettlement({
        billingStatus: row.billing_status,
        generationStatus: row.status,
        taskId: row.task_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
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
    meta,
  ))
})

export default app
