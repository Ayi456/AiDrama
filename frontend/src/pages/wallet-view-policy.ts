export type WalletTone = 'success' | 'warning' | 'error' | 'pending' | 'muted' | 'info'
export type TransactionTone = 'income' | 'expense' | 'neutral'

export type WalletTransactionLike = {
  type?: string
  amount?: string
  videoUsage?: WalletVideoUsageLike | null
  video_usage?: WalletVideoUsageLike | null
}

export type WalletVideoUsageLike = {
  videoGenerationId?: number | null
  video_generation_id?: number | null
  taskId?: string | null
  task_id?: string | null
  provider?: string | null
  model?: string | null
  duration?: number | string | null
  resolution?: string | null
  aspectRatio?: string | null
  aspect_ratio?: string | null
  completionTokens?: number | string | null
  completion_tokens?: number | string | null
  totalTokens?: number | string | null
  total_tokens?: number | string | null
}

export type PaymentOrderLike = {
  orderNo?: string
  order_no?: string
  status?: string
}

export type PendingSettlementLike = {
  billingStatus?: string
  billing_status?: string
  generationStatus?: string
  generation_status?: string
  status?: string
  durationSeconds?: string
  duration_seconds?: string
  amountDue?: string
  amount_due?: string
}

export type WalletPaginationMetaLike = {
  page?: number
  pageSize?: number
  total?: number
  totalPages?: number
}

export type WalletPaginationState = {
  page: number
  pageSize: number
  total: number
  totalPages: number
  canPrevious: boolean
  canNext: boolean
}

export type WalletStatusMeta = {
  label: string
  tone: WalletTone
  action?: string
}

const ORDER_STATUS_META: Record<string, WalletStatusMeta> = {
  pending: { label: '等待支付', tone: 'pending' },
  paid: { label: '已到账', tone: 'success' },
  failed: { label: '支付失败', tone: 'error' },
  closed: { label: '订单已关闭', tone: 'muted' },
}

const BILLING_STATUS_META: Record<string, WalletStatusMeta> = {
  unbilled: { label: '待结算', tone: 'pending', action: '' },
  billing: { label: '结算中', tone: 'info', action: '' },
  settled: { label: '已结算', tone: 'success', action: '' },
  billing_required: { label: '余额不足', tone: 'warning', action: '充值后继续结算' },
  billing_failed: { label: '结算失败', tone: 'error', action: '重试结算' },
}

export function formatMoney(value: unknown): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0.00'
  return numeric.toFixed(2)
}

export function formatTransactionAmount(value: unknown): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric === 0) return '¥0.00'
  const prefix = numeric < 0 ? '-¥' : '¥'
  return `${prefix}${Math.abs(numeric).toFixed(2)}`
}

function readFiniteNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  if (!Number.isFinite(numeric)) return null
  return numeric
}

function readUsageTotalTokens(usage: WalletVideoUsageLike | null): number | null {
  if (!usage) return null
  return readFiniteNumber(usage.totalTokens)
    ?? readFiniteNumber(usage.total_tokens)
    ?? readFiniteNumber(usage.completionTokens)
    ?? readFiniteNumber(usage.completion_tokens)
}

export function formatTokenCount(value: unknown): string {
  const numeric = readFiniteNumber(value)
  if (numeric == null || numeric < 0) return '0'
  return Math.round(numeric).toLocaleString('en-US')
}

function formatDurationSeconds(value: unknown): string {
  const numeric = readFiniteNumber(value)
  if (numeric == null || numeric <= 0) return ''
  return Number.isInteger(numeric) ? `${numeric}s` : `${numeric.toFixed(2)}s`
}

export function getTransactionVideoUsage(transaction: WalletTransactionLike): WalletVideoUsageLike | null {
  return transaction.videoUsage || transaction.video_usage || null
}

export function hasTransactionVideoUsage(transaction: WalletTransactionLike): boolean {
  return readUsageTotalTokens(getTransactionVideoUsage(transaction)) != null
}

export function getTransactionVideoUsageSummary(transaction: WalletTransactionLike): string {
  const usage = getTransactionVideoUsage(transaction)
  const totalTokens = readUsageTotalTokens(usage)
  if (totalTokens == null) return ''

  const parts = [`${formatTokenCount(totalTokens)} tokens`]
  const resolution = usage?.resolution
  const duration = formatDurationSeconds(usage?.duration)
  const model = usage?.model
  if (resolution) parts.push(String(resolution))
  if (duration) parts.push(duration)
  if (!resolution && !duration && model) parts.push(String(model))
  return parts.join(' / ')
}

export function normalizeRechargeAmountInput(value: string): string | null {
  const raw = value.trim()
  if (!/^\d+(\.\d{0,2})?$/.test(raw)) return null

  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < 1 || amount > 9999) return null
  return amount.toFixed(2)
}

export function isValidRechargeAmount(value: string): boolean {
  return normalizeRechargeAmountInput(value) !== null
}

export function getOrderStatusMeta(status: unknown): WalletStatusMeta {
  return ORDER_STATUS_META[String(status || '').toLowerCase()] || { label: '未知状态', tone: 'muted' }
}

export function getPaymentOrderActions(order: PaymentOrderLike) {
  const isPending = String(order.status || '').toLowerCase() === 'pending'
  return {
    canContinuePay: isPending,
    canCancel: isPending,
  }
}

export function hasPendingPaymentOrders(orders: PaymentOrderLike[]) {
  return orders.some(order => String(order.status || '').toLowerCase() === 'pending')
}

function readPaymentOrderNo(order: PaymentOrderLike) {
  return String(order.orderNo || order.order_no || '').trim()
}

export function upsertPaymentOrder<T extends PaymentOrderLike>(orders: T[], order: T) {
  const orderNo = readPaymentOrderNo(order)
  if (!orderNo) return orders

  let replaced = false
  const nextOrders = orders.map((item) => {
    if (readPaymentOrderNo(item) !== orderNo) return item
    replaced = true
    return { ...item, ...order }
  })

  return replaced ? nextOrders : [order, ...orders]
}

export function getBillingStatusMeta(status: unknown): Required<WalletStatusMeta> {
  const meta = BILLING_STATUS_META[String(status || '').toLowerCase()] || { label: '未结算', tone: 'muted', action: '' }
  return { label: meta.label, tone: meta.tone, action: meta.action || '' }
}

function readPendingSettlementBillingStatus(item: PendingSettlementLike) {
  return String(item.billingStatus || item.billing_status || '').toLowerCase()
}

function readPendingSettlementGenerationStatus(item: PendingSettlementLike) {
  return String(item.generationStatus || item.generation_status || item.status || '').toLowerCase()
}

function isInFlightPendingSettlement(item: PendingSettlementLike) {
  const billingStatus = readPendingSettlementBillingStatus(item)
  const generationStatus = readPendingSettlementGenerationStatus(item)
  return billingStatus === 'unbilled' && ['pending', 'processing', 'checking_defect'].includes(generationStatus)
}

export function getPendingSettlementMeta(item: PendingSettlementLike): Required<WalletStatusMeta> {
  if (isInFlightPendingSettlement(item)) {
    return { label: '生成中', tone: 'info', action: '' }
  }
  return getBillingStatusMeta(readPendingSettlementBillingStatus(item))
}

export function getPendingSettlementSummary(item: PendingSettlementLike) {
  const durationSeconds = formatMoney(item.durationSeconds || item.duration_seconds)
  const billingStatus = readPendingSettlementBillingStatus(item)
  if (isInFlightPendingSettlement(item)) {
    return `${durationSeconds} 秒，完成后按实际生成时长扣费`
  }
  if (billingStatus === 'billing') return `${durationSeconds} 秒，正在结算`
  if (billingStatus === 'billing_required') return `${durationSeconds} 秒，充值后继续结算`
  if (billingStatus === 'billing_failed') return `${durationSeconds} 秒，结算失败待重试`
  return `${durationSeconds} 秒`
}

export function isPendingSettlementRetryable(item: PendingSettlementLike) {
  const billingStatus = readPendingSettlementBillingStatus(item)
  return billingStatus === 'billing_required' || billingStatus === 'billing_failed'
}

export function getWalletPaginationState(meta: WalletPaginationMetaLike): WalletPaginationState {
  const pageSize = Math.max(Math.floor(Number(meta.pageSize)) || 10, 1)
  const total = Math.max(Math.floor(Number(meta.total)) || 0, 0)
  const totalPages = Math.max(Math.floor(Number(meta.totalPages)) || Math.ceil(total / pageSize), 1)
  const page = Math.min(Math.max(Math.floor(Number(meta.page)) || 1, 1), totalPages)
  return {
    page,
    pageSize,
    total,
    totalPages,
    canPrevious: page > 1,
    canNext: page < totalPages,
  }
}

export function getWalletPaginationLabel(meta: WalletPaginationMetaLike) {
  const state = getWalletPaginationState(meta)
  return `第 ${state.page} / ${state.totalPages} 页，共 ${state.total} 条`
}

export function getTransactionTone(transaction: WalletTransactionLike): TransactionTone {
  const type = String(transaction.type || '')
  const amount = Number(transaction.amount || 0)
  if (type === 'recharge' || amount > 0) return 'income'
  if (type === 'video_charge' || amount < 0) return 'expense'
  return 'neutral'
}

export function describeTransaction(transaction: WalletTransactionLike): string {
  const type = String(transaction.type || '')
  if (type === 'recharge') return '支付宝充值到账'
  if (type === 'video_charge') return '视频生成扣费'
  if (type === 'adjustment') return '账户调账'
  return '账户流水'
}

export function formatDateTime(value: unknown): string {
  if (!value) return '未记录'
  const date = new Date(String(value))
  if (!Number.isFinite(date.getTime())) return '未记录'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
