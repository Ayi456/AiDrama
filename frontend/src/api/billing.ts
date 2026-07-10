import { api } from './client.ts'
import type {
  PaginatedResponse,
  PaginationParams,
  PaymentOrder,
  PendingVideoSettlement,
  RechargeOrder,
  WalletSummary,
  WalletTransaction,
} from './types.ts'

function paginationQuery(params?: PaginationParams | number) {
  const query = new URLSearchParams()
  if (typeof params === 'number') {
    query.set('pageSize', String(params))
  } else if (params) {
    if (params.page) query.set('page', String(params.page))
    if (params.pageSize) query.set('pageSize', String(params.pageSize))
    if (params.limit) query.set('limit', String(params.limit))
  }
  return query.toString()
}

export const walletAPI = {
  get: () => api.get<WalletSummary>('/wallet'),
  transactions: (params?: PaginationParams | number) => {
    const query = paginationQuery(params)
    return api.get<PaginatedResponse<WalletTransaction>>(`/wallet/transactions${query ? `?${query}` : ''}`)
  },
  videoPrice: () => api.get<{ videoPricePerSecond: string }>('/wallet/video-price'),
  pendingSettlements: (params?: PaginationParams | number) => {
    const query = paginationQuery(params)
    return api.get<PaginatedResponse<PendingVideoSettlement>>(`/wallet/pending-settlements${query ? `?${query}` : ''}`)
  },
}

export const paymentAPI = {
  createRechargeOrder: (amount: string) => api.post<RechargeOrder>('/payments/recharge-orders', { amount }),
  getOrder: (orderNo: string) => api.get<PaymentOrder>(`/payments/orders/${orderNo}`),
  listOrders: (params?: PaginationParams | number) => {
    const query = paginationQuery(params)
    return api.get<PaginatedResponse<PaymentOrder>>(`/payments/orders${query ? `?${query}` : ''}`)
  },
  continueOrder: (orderNo: string) => api.post<RechargeOrder>(`/payments/orders/${encodeURIComponent(orderNo)}/pay`, {}),
  cancelOrder: (orderNo: string) => api.post<PaymentOrder>(`/payments/orders/${encodeURIComponent(orderNo)}/cancel`, {}),
}
