import {
  getVideoGenerationInFlightState,
  STALE_VIDEO_GENERATION_NO_TASK_MS,
  STALE_VIDEO_GENERATION_WITH_TASK_MS,
} from '../../services/automation/video-generation-staleness-policy.js'

export function readWalletListLimit(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 20
  return Math.min(Math.floor(parsed), 100)
}

export type WalletPagination = {
  page: number
  pageSize: number
  offset: number
}

export type WalletPageMeta = WalletPagination & {
  total: number
  totalPages: number
}

export function readWalletPagination(input: {
  page?: unknown
  pageSize?: unknown
  limit?: unknown
}): WalletPagination {
  const parsedPage = Number(input.page)
  const parsedPageSize = Number(input.pageSize ?? input.limit)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1
  const pageSize = Number.isFinite(parsedPageSize) && parsedPageSize > 0
    ? Math.min(Math.floor(parsedPageSize), 50)
    : 10
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  }
}

export function buildWalletPageMeta(
  pagination: Pick<WalletPagination, 'page' | 'pageSize'>,
  totalValue: unknown,
): WalletPageMeta {
  const total = Math.max(Math.floor(Number(totalValue)) || 0, 0)
  const pageSize = Math.min(Math.max(Math.floor(Number(pagination.pageSize)) || 10, 1), 50)
  const totalPages = Math.max(Math.ceil(total / pageSize), 1)
  const page = Math.min(Math.max(Math.floor(Number(pagination.page)) || 1, 1), totalPages)
  return {
    page,
    pageSize,
    total,
    totalPages,
    offset: (page - 1) * pageSize,
  }
}

export function buildWalletPaginatedPayload<T>(
  items: T[],
  meta: Pick<WalletPageMeta, 'page' | 'pageSize' | 'total' | 'totalPages'>,
) {
  return {
    items,
    page: meta.page,
    pageSize: meta.pageSize,
    total: meta.total,
    totalPages: meta.totalPages,
  }
}

const BILLING_PENDING_STATUSES = new Set(['billing', 'billing_required', 'billing_failed'])

export function buildPendingSettlementInFlightCutoffs(nowMs = Date.now()) {
  return {
    withoutTaskUpdatedAfter: new Date(nowMs - STALE_VIDEO_GENERATION_NO_TASK_MS).toISOString(),
    withTaskUpdatedAfter: new Date(nowMs - STALE_VIDEO_GENERATION_WITH_TASK_MS).toISOString(),
  }
}

export function shouldExposePendingSettlement(input: {
  billingStatus?: unknown
  generationStatus?: unknown
  taskId?: unknown
  updatedAt?: unknown
  createdAt?: unknown
  nowMs?: number
}) {
  const billingStatus = String(input.billingStatus || '').toLowerCase()
  const generationStatus = String(input.generationStatus || '').toLowerCase()
  if (BILLING_PENDING_STATUSES.has(billingStatus)) return true
  if (billingStatus !== 'unbilled') return false
  return getVideoGenerationInFlightState({
    status: generationStatus,
    taskId: toNullableString(input.taskId),
    updatedAt: toNullableString(input.updatedAt),
    createdAt: toNullableString(input.createdAt),
  }, input.nowMs).inFlight
}

function toNullableString(value: unknown) {
  if (value == null) return null
  const text = String(value)
  return text || null
}
