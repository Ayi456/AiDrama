import type { PoolConnection, RowDataPacket } from 'mysql2/promise'

import { now } from '../../utils/response.js'
import { money, multiplyMoney, toMoney, type MoneyString } from './money.js'

export type WalletAccount = {
  userId: number
  balance: MoneyString
  totalRecharged: MoneyString
  totalConsumed: MoneyString
  createdAt: string
  updatedAt: string
}

export type WalletTransaction = {
  transactionNo: string
  userId: number
  amount: MoneyString
  balanceAfter: MoneyString
  type: 'recharge' | 'video_charge' | 'adjustment'
  relatedOrderNo: string | null
  relatedVideoGenerationId: number | null
  description: string | null
  createdAt: string
  videoUsage?: WalletVideoUsage | null
}

export type WalletVideoUsage = {
  videoGenerationId: number | null
  taskId: string | null
  provider: string | null
  model: string | null
  duration: number | null
  resolution: string | null
  aspectRatio: string | null
  completionTokens: number | null
  totalTokens: number | null
  raw: unknown | null
}

export type RechargeCreditParams = {
  userId: number
  amount: MoneyString
  orderNo: string
  transactionNo?: string
  description?: string
}

export type VideoDebitParams = {
  userId: number
  amount: MoneyString
  videoGenerationId: number
  transactionNo?: string
  description?: string
}

export type WalletMutationResult = {
  account: WalletAccount
  transactionNo: string
}

export type WalletConnection = Pick<PoolConnection, 'execute' | 'query'>

type WalletRow = RowDataPacket & {
  user_id: number
  balance: string
  total_recharged: string
  total_consumed: string
  created_at: string
  updated_at: string
}

type WalletTransactionRow = RowDataPacket & {
  transaction_no: string
  user_id: number
  amount: string
  balance_after: string
  type: WalletTransaction['type']
  related_order_no: string | null
  related_video_generation_id: number | null
  description: string | null
  created_at: string
  video_task_id?: string | null
  video_provider?: string | null
  video_model?: string | null
  video_duration?: number | string | null
  video_resolution?: string | null
  video_aspect_ratio?: string | null
  provider_usage_completion_tokens?: number | string | null
  provider_usage_total_tokens?: number | string | null
  provider_usage_raw?: string | null
  provider_response?: string | null
}

type CountRow = RowDataPacket & {
  total: number
}

export class InsufficientBalanceError extends Error {
  readonly code = 'INSUFFICIENT_BALANCE'

  constructor(message = '余额不足，请先充值') {
    super(message)
    this.name = 'InsufficientBalanceError'
  }
}

export function isInsufficientBalanceError(error: unknown): error is InsufficientBalanceError {
  return error instanceof InsufficientBalanceError
    || Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'INSUFFICIENT_BALANCE')
}

export function insufficientBalance(message?: string) {
  return new InsufficientBalanceError(message)
}

export function calculateRechargeCredit(input: {
  balance: MoneyString
  totalRecharged: MoneyString
  amount: MoneyString
}) {
  const nextBalance = money(input.balance).plus(input.amount)
  const nextTotal = money(input.totalRecharged).plus(input.amount)
  return {
    balance: toMoney(nextBalance),
    totalRecharged: toMoney(nextTotal),
    transactionAmount: toMoney(input.amount),
  }
}

export function calculateVideoDebit(input: {
  balance: MoneyString
  totalConsumed: MoneyString
  amount: MoneyString
}) {
  const nextBalance = money(input.balance).minus(input.amount)
  if (nextBalance.lt(0)) throw insufficientBalance()

  const nextTotal = money(input.totalConsumed).plus(input.amount)
  return {
    balance: toMoney(nextBalance),
    totalConsumed: toMoney(nextTotal),
    transactionAmount: `-${toMoney(input.amount)}`,
  }
}

export function assertCanCoverNextSecond(balance: MoneyString, pricePerSecond: MoneyString) {
  if (money(balance).lt(pricePerSecond)) throw insufficientBalance()
}

export function assertCanCoverVideoDuration(
  balance: MoneyString,
  pricePerSecond: MoneyString,
  durationSeconds: string | number,
) {
  const seconds = money(durationSeconds)
  const requiredAmount = toMoney(multiplyMoney(seconds, pricePerSecond))
  if (seconds.lte(0) || money(balance).lt(requiredAmount)) {
    throw insufficientBalance(`余额不足，本次视频生成需要至少 ${requiredAmount} 元，请先充值`)
  }
}

export function buildWalletTransactionNo(prefix = 'WT') {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  const random = Math.random().toString(36).slice(2, 10).toUpperCase()
  return `${prefix}${stamp}${random}`
}

function mapWallet(row: WalletRow): WalletAccount {
  return {
    userId: Number(row.user_id),
    balance: toMoney(row.balance),
    totalRecharged: toMoney(row.total_recharged),
    totalConsumed: toMoney(row.total_consumed),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function readFiniteNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(numeric)) return null
  return numeric
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function parseJson(value: unknown): unknown | null {
  if (!value) return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function extractUsageRecord(value: unknown): Record<string, unknown> | null {
  const parsed = parseJson(value)
  if (!isRecord(parsed)) return null
  if ('completion_tokens' in parsed || 'total_tokens' in parsed) return parsed
  return isRecord(parsed.usage) ? parsed.usage : null
}

function mapWalletVideoUsage(row: WalletTransactionRow): WalletVideoUsage | null {
  const usageRecord = extractUsageRecord(row.provider_usage_raw) || extractUsageRecord(row.provider_response)
  const completionTokens = readFiniteNumber(row.provider_usage_completion_tokens)
    ?? readFiniteNumber(usageRecord?.completion_tokens)
  const totalTokens = readFiniteNumber(row.provider_usage_total_tokens)
    ?? readFiniteNumber(usageRecord?.total_tokens)
  const videoGenerationId = row.related_video_generation_id == null ? null : Number(row.related_video_generation_id)
  const hasVideoMetadata = Boolean(
    videoGenerationId
      || row.video_task_id
      || row.video_provider
      || row.video_model
      || row.video_duration
      || row.video_resolution
      || row.video_aspect_ratio,
  )
  const hasUsage = completionTokens != null || totalTokens != null || Boolean(usageRecord)
  if (!hasVideoMetadata && !hasUsage) return null

  return {
    videoGenerationId,
    taskId: readNullableString(row.video_task_id),
    provider: readNullableString(row.video_provider),
    model: readNullableString(row.video_model),
    duration: readFiniteNumber(row.video_duration),
    resolution: readNullableString(row.video_resolution),
    aspectRatio: readNullableString(row.video_aspect_ratio),
    completionTokens,
    totalTokens,
    raw: usageRecord,
  }
}

export function mapWalletTransaction(row: WalletTransactionRow): WalletTransaction {
  const videoUsage = mapWalletVideoUsage(row)
  return {
    transactionNo: row.transaction_no,
    userId: Number(row.user_id),
    amount: toMoney(row.amount),
    balanceAfter: toMoney(row.balance_after),
    type: row.type,
    relatedOrderNo: row.related_order_no,
    relatedVideoGenerationId: row.related_video_generation_id == null ? null : Number(row.related_video_generation_id),
    description: row.description,
    createdAt: row.created_at,
    ...(videoUsage ? { videoUsage } : {}),
  }
}

async function ensureWalletRow(userId: number, conn: WalletConnection) {
  const ts = now()
  await conn.execute(
    `INSERT IGNORE INTO wallet_accounts (user_id, balance, total_recharged, total_consumed, created_at, updated_at)
     VALUES (?, 0.00, 0.00, 0.00, ?, ?)`,
    [userId, ts, ts],
  )
}

async function loadWalletForUpdate(userId: number, conn: WalletConnection) {
  const [rows] = await conn.execute<WalletRow[]>(
    `SELECT user_id, balance, total_recharged, total_consumed, created_at, updated_at
       FROM wallet_accounts
      WHERE user_id = ?
      LIMIT 1
      FOR UPDATE`,
    [userId],
  )
  const row = rows[0]
  if (!row) throw new Error('Wallet account not found')
  return mapWallet(row)
}

async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>) {
  const { mysqlPool } = await import('../../db/index.js')
  const conn = await mysqlPool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await fn(conn)
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

export async function getOrCreateWallet(userId: number): Promise<WalletAccount> {
  const { mysqlPool } = await import('../../db/index.js')
  const conn = await mysqlPool.getConnection()
  try {
    await ensureWalletRow(userId, conn)
    const [rows] = await conn.execute<WalletRow[]>(
      `SELECT user_id, balance, total_recharged, total_consumed, created_at, updated_at
         FROM wallet_accounts
        WHERE user_id = ?
        LIMIT 1`,
      [userId],
    )
    return mapWallet(rows[0])
  } finally {
    conn.release()
  }
}

export async function countWalletTransactions(userId: number): Promise<number> {
  const { mysqlPool } = await import('../../db/index.js')
  const [rows] = await mysqlPool.execute<CountRow[]>(
    `SELECT COUNT(*) AS total
       FROM wallet_transactions
      WHERE user_id = ?`,
    [userId],
  )
  return Number(rows[0]?.total || 0)
}

export async function getWalletTransactions(
  userId: number,
  options: number | { pageSize?: number; offset?: number } = 20,
): Promise<WalletTransaction[]> {
  const { mysqlPool } = await import('../../db/index.js')
  const pageSize = typeof options === 'number'
    ? Math.min(Math.max(Math.floor(Number(options)) || 20, 1), 100)
    : Math.min(Math.max(Math.floor(Number(options.pageSize)) || 20, 1), 100)
  const offset = typeof options === 'number'
    ? 0
    : Math.max(Math.floor(Number(options.offset)) || 0, 0)
  const [rows] = await mysqlPool.execute<WalletTransactionRow[]>(
    `SELECT wt.transaction_no, wt.user_id, wt.amount, wt.balance_after, wt.type, wt.related_order_no,
            wt.related_video_generation_id, wt.description, wt.created_at,
            vg.task_id AS video_task_id,
            vg.provider AS video_provider,
            vg.model AS video_model,
            COALESCE(NULLIF(vg.billed_seconds, 0.00), vg.pending_duration_seconds, vg.duration) AS video_duration,
            vg.resolution AS video_resolution,
            vg.aspect_ratio AS video_aspect_ratio,
            vg.provider_usage_completion_tokens,
            vg.provider_usage_total_tokens,
            vg.provider_usage_raw,
            vg.provider_response
       FROM wallet_transactions wt
       LEFT JOIN video_generations vg ON vg.id = wt.related_video_generation_id
      WHERE wt.user_id = ?
      ORDER BY wt.created_at DESC, wt.id DESC
      LIMIT ${pageSize} OFFSET ${offset}`,
    [userId],
  )
  return rows.map(mapWalletTransaction)
}

export async function creditWalletForRecharge(
  params: RechargeCreditParams,
  options: { connection?: PoolConnection } = {},
): Promise<WalletMutationResult> {
  const run = async (conn: WalletConnection): Promise<WalletMutationResult> => {
    await ensureWalletRow(params.userId, conn)
    const account = await loadWalletForUpdate(params.userId, conn)
    const calculated = calculateRechargeCredit({
      balance: account.balance,
      totalRecharged: account.totalRecharged,
      amount: params.amount,
    })
    const ts = now()
    const transactionNo = params.transactionNo || buildWalletTransactionNo('WR')

    await conn.execute(
      `UPDATE wallet_accounts
          SET balance = ?, total_recharged = ?, updated_at = ?
        WHERE user_id = ?`,
      [calculated.balance, calculated.totalRecharged, ts, params.userId],
    )
    await conn.execute(
      `INSERT INTO wallet_transactions (
         transaction_no, user_id, amount, balance_after, type, related_order_no, description, created_at
       ) VALUES (?, ?, ?, ?, 'recharge', ?, ?, ?)`,
      [
        transactionNo,
        params.userId,
        calculated.transactionAmount,
        calculated.balance,
        params.orderNo,
        params.description || `支付宝充值到账 ${params.amount} 元`,
        ts,
      ],
    )

    return {
      transactionNo,
      account: {
        ...account,
        balance: calculated.balance,
        totalRecharged: calculated.totalRecharged,
        updatedAt: ts,
      },
    }
  }

  if (options.connection) return run(options.connection)
  return withTransaction(run)
}

export async function debitWalletForVideo(
  params: VideoDebitParams,
  options: { connection?: PoolConnection } = {},
): Promise<WalletMutationResult> {
  const run = async (conn: WalletConnection): Promise<WalletMutationResult> => {
    await ensureWalletRow(params.userId, conn)
    const account = await loadWalletForUpdate(params.userId, conn)
    const calculated = calculateVideoDebit({
      balance: account.balance,
      totalConsumed: account.totalConsumed,
      amount: params.amount,
    })
    const ts = now()
    const transactionNo = params.transactionNo || buildWalletTransactionNo('WV')

    await conn.execute(
      `UPDATE wallet_accounts
          SET balance = ?, total_consumed = ?, updated_at = ?
        WHERE user_id = ?`,
      [calculated.balance, calculated.totalConsumed, ts, params.userId],
    )
    await conn.execute(
      `INSERT INTO wallet_transactions (
         transaction_no, user_id, amount, balance_after, type,
         related_video_generation_id, description, created_at
       ) VALUES (?, ?, ?, ?, 'video_charge', ?, ?, ?)`,
      [
        transactionNo,
        params.userId,
        calculated.transactionAmount,
        calculated.balance,
        params.videoGenerationId,
        params.description || `视频生成扣费 ${params.amount} 元`,
        ts,
      ],
    )

    return {
      transactionNo,
      account: {
        ...account,
        balance: calculated.balance,
        totalConsumed: calculated.totalConsumed,
        updatedAt: ts,
      },
    }
  }

  if (options.connection) return run(options.connection)
  return withTransaction(run)
}

export async function assertCanStartVideo(userId: number, durationSeconds: string | number = 1): Promise<void> {
  const { getVideoPricePerSecond } = await import('./billing-settings.js')
  const [wallet, pricePerSecond] = await Promise.all([
    getOrCreateWallet(userId),
    getVideoPricePerSecond(),
  ])
  assertCanCoverVideoDuration(wallet.balance, pricePerSecond, durationSeconds)
}
