import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { eq } from 'drizzle-orm'

import { now } from '../../utils/response.js'
import { assertSeconds, money, multiplyMoney, toMoney, type MoneyString } from './money.js'
import { debitWalletForVideo, isInsufficientBalanceError } from './wallet.js'

export type VideoBillingStatus = 'unbilled' | 'billing' | 'settled' | 'billing_required' | 'billing_failed'

export type VideoBillingResult = {
  status: VideoBillingStatus
  billedSeconds: MoneyString
  billingAmount: MoneyString
  secondsDelta: MoneyString
  amount: MoneyString
  message?: string
}

type VideoBillingGenerationRow = RowDataPacket & {
  id: number
  user_id: number | null
  storyboard_id: number | null
  drama_id: number | null
  billed_seconds: string
  billing_amount: string
  billing_status: VideoBillingStatus | null
  pending_video_url: string | null
  pending_local_path: string | null
  pending_duration_seconds: string | null
}

type VideoBillingEventRow = RowDataPacket & {
  billed_total_seconds: string
  amount: string
  seconds_delta: string
}

type VideoOwnerRow = RowDataPacket & {
  direct_user_id: number | null
  drama_user_id: number | null
  storyboard_user_id: number | null
}

export function calculateVideoBillingCharge(input: {
  billedSeconds: MoneyString
  confirmedTotalSeconds: MoneyString
  pricePerSecond: MoneyString
}) {
  const secondsDelta = money(input.confirmedTotalSeconds).minus(input.billedSeconds)
  if (secondsDelta.lte(0)) {
    return {
      secondsDelta: '0.00',
      amount: '0.00',
      shouldCharge: false,
    }
  }

  return {
    secondsDelta: toMoney(secondsDelta),
    amount: toMoney(multiplyMoney(secondsDelta, input.pricePerSecond)),
    shouldCharge: true,
  }
}

export function buildBillingRequiredVideoPatch(input: {
  publicUrl: string
  localPath: string
  durationSeconds: string | number
  message: string
  updatedAt: string
}) {
  return {
    billingStatus: 'billing_required' as const,
    billingError: input.message,
    pendingVideoUrl: input.publicUrl,
    pendingLocalPath: input.localPath,
    pendingDurationSeconds: assertSeconds(input.durationSeconds),
    status: 'billing_required' as const,
    updatedAt: input.updatedAt,
  }
}

function buildVideoBillingEventNo(videoGenerationId: number) {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `VB${videoGenerationId}${stamp}${random}`
}

async function loadBillingGenerationForUpdate(conn: PoolConnection, id: number) {
  const [rows] = await conn.execute<VideoBillingGenerationRow[]>(
    `SELECT id, user_id, storyboard_id, drama_id, billed_seconds, billing_amount,
            billing_status, pending_video_url, pending_local_path, pending_duration_seconds
       FROM video_generations
      WHERE id = ?
      LIMIT 1
      FOR UPDATE`,
    [id],
  )
  return rows[0] || null
}

async function loadEventByIdempotencyKey(conn: PoolConnection, idempotencyKey: string) {
  const [rows] = await conn.execute<VideoBillingEventRow[]>(
    `SELECT billed_total_seconds, amount, seconds_delta
       FROM video_billing_events
      WHERE idempotency_key = ?
      LIMIT 1`,
    [idempotencyKey],
  )
  return rows[0] || null
}

export async function resolveVideoGenerationUserId(videoGenerationId: number): Promise<number | null> {
  const { mysqlPool } = await import('../../db/index.js')
  const [rows] = await mysqlPool.execute<VideoOwnerRow[]>(
    `SELECT vg.user_id AS direct_user_id,
            d.user_id AS drama_user_id,
            sd.user_id AS storyboard_user_id
       FROM video_generations vg
       LEFT JOIN dramas d ON d.id = vg.drama_id
       LEFT JOIN storyboards sb ON sb.id = vg.storyboard_id
       LEFT JOIN episodes ep ON ep.id = sb.episode_id
       LEFT JOIN dramas sd ON sd.id = ep.drama_id
      WHERE vg.id = ?
      LIMIT 1`,
    [videoGenerationId],
  )
  const row = rows[0]
  if (!row) return null
  return Number(row.direct_user_id || row.drama_user_id || row.storyboard_user_id || 0) || null
}

export async function billVideoSeconds(params: {
  userId: number
  videoGenerationId: number
  confirmedTotalSeconds: string | number
  idempotencyKey: string
}): Promise<VideoBillingResult> {
  const { mysqlPool } = await import('../../db/index.js')
  const { getVideoPricePerSecond } = await import('./billing-settings.js')
  const confirmedTotalSeconds = assertSeconds(params.confirmedTotalSeconds)
  const pricePerSecond = await getVideoPricePerSecond()
  const conn = await mysqlPool.getConnection()

  try {
    await conn.beginTransaction()

    const existingEvent = await loadEventByIdempotencyKey(conn, params.idempotencyKey)
    if (existingEvent) {
      await conn.commit()
      return {
        status: 'settled',
        billedSeconds: toMoney(existingEvent.billed_total_seconds),
        billingAmount: toMoney(existingEvent.amount),
        secondsDelta: toMoney(existingEvent.seconds_delta),
        amount: toMoney(existingEvent.amount),
      }
    }

    const record = await loadBillingGenerationForUpdate(conn, params.videoGenerationId)
    if (!record) throw new Error('Video generation not found')

    const charge = calculateVideoBillingCharge({
      billedSeconds: toMoney(record.billed_seconds || '0.00'),
      confirmedTotalSeconds,
      pricePerSecond,
    })

    if (!charge.shouldCharge) {
      await conn.execute(
        `UPDATE video_generations
            SET billing_status = 'settled', billing_error = NULL, updated_at = ?
          WHERE id = ?`,
        [now(), params.videoGenerationId],
      )
      await conn.commit()
      return {
        status: 'settled',
        billedSeconds: confirmedTotalSeconds,
        billingAmount: toMoney(record.billing_amount || '0.00'),
        ...charge,
      }
    }

    await conn.execute(
      `UPDATE video_generations
          SET billing_status = 'billing', billing_error = NULL, updated_at = ?
        WHERE id = ?`,
      [now(), params.videoGenerationId],
    )

    let walletTransactionNo = ''
    try {
      const walletResult = await debitWalletForVideo({
        userId: params.userId,
        amount: charge.amount,
        videoGenerationId: params.videoGenerationId,
        description: `视频生成扣费 ${charge.secondsDelta} 秒 x ${pricePerSecond} 元/秒`,
      }, { connection: conn })
      walletTransactionNo = walletResult.transactionNo
    } catch (error) {
      if (!isInsufficientBalanceError(error)) throw error
      const message = '余额不足，请充值后继续结算'
      await conn.execute(
        `UPDATE video_generations
            SET billing_status = 'billing_required',
                billing_error = ?,
                status = 'billing_required',
                updated_at = ?
          WHERE id = ?`,
        [message, now(), params.videoGenerationId],
      )
      await conn.commit()
      return {
        status: 'billing_required',
        billedSeconds: toMoney(record.billed_seconds || '0.00'),
        billingAmount: toMoney(record.billing_amount || '0.00'),
        secondsDelta: charge.secondsDelta,
        amount: charge.amount,
        message,
      }
    }

    const nextBillingAmount = toMoney(money(record.billing_amount || '0.00').plus(charge.amount))
    const ts = now()
    await conn.execute(
      `INSERT INTO video_billing_events (
         event_no, user_id, video_generation_id, seconds_delta, price_per_second,
         amount, billed_total_seconds, wallet_transaction_no, idempotency_key, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        buildVideoBillingEventNo(params.videoGenerationId),
        params.userId,
        params.videoGenerationId,
        charge.secondsDelta,
        pricePerSecond,
        charge.amount,
        confirmedTotalSeconds,
        walletTransactionNo,
        params.idempotencyKey,
        ts,
      ],
    )
    await conn.execute(
      `UPDATE video_generations
          SET billed_seconds = ?,
              billing_amount = ?,
              billing_status = 'settled',
              billing_error = NULL,
              updated_at = ?
        WHERE id = ?`,
      [confirmedTotalSeconds, nextBillingAmount, ts, params.videoGenerationId],
    )

    await conn.commit()
    return {
      status: 'settled',
      billedSeconds: confirmedTotalSeconds,
      billingAmount: nextBillingAmount,
      secondsDelta: charge.secondsDelta,
      amount: charge.amount,
    }
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

export async function settleCompletedVideo(params: {
  userId: number
  videoGenerationId: number
  videoUrl: string
  localPath: string
  durationSeconds: string | number
}): Promise<'settled' | 'billing_required'> {
  const durationSeconds = assertSeconds(params.durationSeconds)
  const result = await billVideoSeconds({
    userId: params.userId,
    videoGenerationId: params.videoGenerationId,
    confirmedTotalSeconds: durationSeconds,
    idempotencyKey: `video:${params.videoGenerationId}:settle:${durationSeconds}`,
  })
  return result.status === 'billing_required' ? 'billing_required' : 'settled'
}

export async function persistPendingVideoSettlement(params: {
  videoGenerationId: number
  publicUrl: string
  localPath: string
  durationSeconds: string | number
  message: string
}) {
  const { db, schema } = await import('../../db/index.js')
  await db.update(schema.videoGenerations)
    .set(buildBillingRequiredVideoPatch({
      publicUrl: params.publicUrl,
      localPath: params.localPath,
      durationSeconds: params.durationSeconds,
      message: params.message,
      updatedAt: now(),
    }))
    .where(eq(schema.videoGenerations.id, params.videoGenerationId))
    .run()
}

export async function retryVideoSettlement(userId: number, videoGenerationId: number): Promise<'settled'> {
  const { db, schema } = await import('../../db/index.js')
  const [record] = await db.select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.id, videoGenerationId))
    .all()
  if (!record) throw new Error('Video generation not found')

  const ownerUserId = record.userId || await resolveVideoGenerationUserId(videoGenerationId)
  if (ownerUserId !== userId) throw new Error('Video generation not found')
  if (record.billingStatus !== 'billing_required') throw new Error('Video does not require billing retry')
  if (!record.pendingVideoUrl || !record.pendingDurationSeconds) throw new Error('Pending video settlement data missing')

  const durationSeconds = assertSeconds(record.pendingDurationSeconds)
  const result = await billVideoSeconds({
    userId,
    videoGenerationId,
    confirmedTotalSeconds: durationSeconds,
    idempotencyKey: `video:${videoGenerationId}:settle:${durationSeconds}`,
  })
  if (result.status === 'billing_required') throw new Error(result.message || '余额不足，请先充值')

  const ts = now()
  await db.update(schema.videoGenerations)
    .set({
      videoUrl: record.pendingVideoUrl,
      minioUrl: record.pendingVideoUrl,
      localPath: record.pendingLocalPath || record.localPath,
      status: 'completed',
      billingStatus: 'settled',
      billingError: null,
      pendingVideoUrl: null,
      pendingLocalPath: null,
      pendingDurationSeconds: null,
      completedAt: ts,
      updatedAt: ts,
    })
    .where(eq(schema.videoGenerations.id, videoGenerationId))
    .run()

  if (record.storyboardId) {
    await db.update(schema.storyboards)
      .set({
        videoUrl: record.pendingVideoUrl,
        duration: Math.round(Number(durationSeconds)),
        updatedAt: ts,
      })
      .where(eq(schema.storyboards.id, record.storyboardId))
      .run()
  }

  return 'settled'
}
