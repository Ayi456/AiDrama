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

function mapWalletTransaction(row: WalletTransactionRow): WalletTransaction {
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

export async function getWalletTransactions(userId: number, limit = 20): Promise<WalletTransaction[]> {
  const { mysqlPool } = await import('../../db/index.js')
  const safeLimit = Math.min(Math.max(Math.floor(Number(limit)) || 20, 1), 100)
  const [rows] = await mysqlPool.execute<WalletTransactionRow[]>(
    `SELECT transaction_no, user_id, amount, balance_after, type, related_order_no,
            related_video_generation_id, description, created_at
       FROM wallet_transactions
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ${safeLimit}`,
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
