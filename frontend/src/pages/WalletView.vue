<template>
  <div class="wallet-page">
    <section class="wallet-hero" aria-labelledby="wallet-title">
      <div class="wallet-balance-panel">
        <div class="wallet-page-kicker">账户余额</div>
        <h1 id="wallet-title">充值与结算</h1>
        <p>支付宝充值到账后进入余额，视频只按已确认生成秒数扣费。</p>

        <div class="wallet-balance-number">
          <span>¥</span>{{ summary.balance }}
        </div>

        <div class="wallet-metrics">
          <div>
            <b>¥{{ summary.totalRecharged }}</b>
            <span>累计充值</span>
          </div>
          <div>
            <b>¥{{ summary.totalConsumed }}</b>
            <span>累计消费</span>
          </div>
          <div>
            <b>¥{{ summary.videoPricePerSecond }}/秒</b>
            <span>当前单价</span>
          </div>
        </div>

        <div v-if="walletError" class="wallet-inline-alert warning">
          <CircleAlert :size="15" :stroke-width="1.9" />
          <span>{{ walletError }}</span>
        </div>
      </div>

      <form class="wallet-recharge-card" @submit.prevent="createRechargeOrder">
        <div class="wallet-card-head">
          <div>
            <h2>支付宝充值</h2>
            <p>支持整数或小数金额，支付完成后余额会自动更新。</p>
          </div>
          <Wallet :size="20" :stroke-width="1.8" />
        </div>

        <label class="field">
          <span class="field-label">充值金额</span>
          <div class="wallet-money-input">
            <span>¥</span>
            <input
              v-model.trim="rechargeAmount"
              class="input"
              inputmode="decimal"
              placeholder="1"
              autocomplete="off"
            />
          </div>
          <span v-if="rechargeError" class="field-error">{{ rechargeError }}</span>
          <span v-else class="field-hint">充值金额为 1 到 9999 元，提交后会按两位小数确认。</span>
        </label>

        <div class="wallet-quick-amounts" aria-label="快捷金额">
          <button
            v-for="amount in quickAmounts"
            :key="amount"
            type="button"
            :class="{ active: rechargeAmount === amount }"
            @click="rechargeAmount = amount"
          >
            ¥{{ amount }}
          </button>
        </div>

        <button class="btn btn-primary wallet-pay-button" type="submit" :disabled="creatingOrder">
          <Loader2 v-if="creatingOrder" :size="15" class="animate-spin" />
          <CreditCard v-else :size="15" :stroke-width="2" />
          {{ creatingOrder ? '创建订单中...' : '前往支付宝支付' }}
        </button>

        <div v-if="activeOrder" class="wallet-order-callout">
          <span :class="['wallet-status', getOrderStatusMeta(activeOrder.status).tone]">
            {{ getOrderStatusMeta(activeOrder.status).label }}
          </span>
          <span>{{ readOrderNo(activeOrder) }}</span>
        </div>
      </form>
    </section>

    <section v-if="pendingSettlements.length" class="wallet-settlement-banner">
      <div>
        <h2>有 {{ pendingSettlementTotal }} 个视频等待结算</h2>
        <p>充值后系统会继续处理结算，并在成功后发布成品视频。</p>
      </div>
      <button class="btn" type="button" @click="scrollToPendingList">
        查看待结算
      </button>
    </section>

    <div class="wallet-ledger-grid">
      <section id="wallet-orders" class="wallet-ledger wallet-ledger--orders">
        <div class="wallet-section-head">
          <div>
            <h2>充值订单</h2>
            <p>查看充值记录和未完成订单，待支付订单可继续支付或取消。</p>
          </div>
          <span class="wallet-section-count">{{ ordersPage.total }} 条</span>
        </div>

        <div class="wallet-list">
          <article v-for="order in orders" :key="readOrderNo(order)" class="wallet-row">
            <span :class="['wallet-row-icon', getOrderStatusMeta(order.status).tone]">
              <ReceiptText :size="15" :stroke-width="1.9" />
            </span>
            <div class="wallet-row-main">
              <strong>{{ readOrderNo(order) }}</strong>
              <span>{{ formatDateTime(order.createdAt || order.created_at) }}</span>
            </div>
            <div class="wallet-row-side">
              <div class="wallet-order-summary">
                <b>¥{{ formatMoney(order.amount) }}</b>
                <span :class="['wallet-status', getOrderStatusMeta(order.status).tone]">
                  {{ getOrderStatusMeta(order.status).label }}
                </span>
              </div>
              <div v-if="getPaymentOrderActions(order).canContinuePay" class="wallet-order-actions">
                <button
                  class="btn btn-sm"
                  type="button"
                  :disabled="orderActionOrderNo === readOrderNo(order)"
                  @click="continuePayment(order)"
                >
                  <CreditCard :size="13" :stroke-width="2" />
                  继续支付
                </button>
                <button
                  class="btn btn-sm wallet-order-cancel"
                  type="button"
                  :disabled="orderActionOrderNo === readOrderNo(order)"
                  @click="cancelPayment(order)"
                >
                  <XCircle :size="13" :stroke-width="2" />
                  取消
                </button>
              </div>
            </div>
          </article>

          <div v-if="!orders.length" class="wallet-empty">
            <ReceiptText :size="22" :stroke-width="1.7" />
            <strong>暂无充值订单</strong>
            <span>{{ ordersError || '创建充值订单后会显示在这里。' }}</span>
          </div>
        </div>

        <div v-if="shouldShowPagination(ordersPage)" class="wallet-pagination">
          <button class="btn btn-sm" type="button" :disabled="!ordersPager.canPrevious" @click="goOrdersPage(ordersPage.page - 1)">
            上一页
          </button>
          <span>{{ getWalletPaginationLabel(ordersPage) }}</span>
          <button class="btn btn-sm" type="button" :disabled="!ordersPager.canNext" @click="goOrdersPage(ordersPage.page + 1)">
            下一页
          </button>
        </div>
      </section>

      <section id="wallet-transactions" class="wallet-ledger wallet-ledger--transactions">
        <div class="wallet-section-head">
          <div>
            <h2>余额流水</h2>
            <p>每一笔充值和视频扣费都会保留记录，方便核对余额变化。</p>
          </div>
          <span class="wallet-section-count">{{ transactionsPage.total }} 条</span>
        </div>

        <div class="wallet-list">
          <article v-for="transaction in transactions" :key="readTransactionNo(transaction)" class="wallet-row">
            <span :class="['wallet-row-icon', getTransactionTone(transaction)]">
              <ArrowDownLeft v-if="getTransactionTone(transaction) === 'income'" :size="15" :stroke-width="1.9" />
              <ArrowUpRight v-else :size="15" :stroke-width="1.9" />
            </span>
            <div class="wallet-row-main">
              <strong>{{ transaction.description || describeTransaction(transaction) }}</strong>
              <span>{{ formatDateTime(transaction.createdAt || transaction.created_at) }}</span>
            </div>
            <div class="wallet-row-side">
              <b :class="getTransactionTone(transaction)">{{ formatTransactionAmount(transaction.amount) }}</b>
              <span>余额 ¥{{ formatMoney(transaction.balanceAfter || transaction.balance_after) }}</span>
            </div>
          </article>

          <div v-if="!transactions.length" class="wallet-empty">
            <ListChecks :size="22" :stroke-width="1.7" />
            <strong>暂无余额流水</strong>
            <span>{{ transactionsError || '充值到账和视频扣费都会记录在这里。' }}</span>
          </div>
        </div>

        <div v-if="shouldShowPagination(transactionsPage)" class="wallet-pagination">
          <button class="btn btn-sm" type="button" :disabled="!transactionsPager.canPrevious" @click="goTransactionsPage(transactionsPage.page - 1)">
            上一页
          </button>
          <span>{{ getWalletPaginationLabel(transactionsPage) }}</span>
          <button class="btn btn-sm" type="button" :disabled="!transactionsPager.canNext" @click="goTransactionsPage(transactionsPage.page + 1)">
            下一页
          </button>
        </div>
      </section>

      <section id="wallet-pending" class="wallet-ledger wallet-ledger--pending">
        <div class="wallet-section-head">
          <div>
            <h2>视频待结算</h2>
          <p>结算中、余额不足和结算失败的视频会实时更新。</p>
          </div>
          <span class="wallet-section-count">{{ pendingPage.total }} 条</span>
        </div>

        <div class="wallet-list">
          <article v-for="item in pendingSettlements" :key="item.videoGenerationId" class="wallet-row wallet-row--pending">
            <span :class="['wallet-row-icon', getPendingSettlementMeta(item).tone]">
              <Clock3 :size="15" :stroke-width="1.9" />
            </span>
            <div class="wallet-row-main">
              <strong>{{ item.title || `视频任务 #${item.videoGenerationId}` }}</strong>
              <span>{{ getPendingSettlementSummary(item) }}</span>
            </div>
            <div class="wallet-row-side">
              <span :class="['wallet-status', getPendingSettlementMeta(item).tone]">
                {{ getPendingSettlementMeta(item).label }}
              </span>
              <button
                v-if="isPendingSettlementRetryable(item)"
                class="btn btn-sm"
                type="button"
                @click="retrySettlement(item.videoGenerationId)"
              >
                重试结算
              </button>
            </div>
          </article>

          <div v-if="!pendingSettlements.length" class="wallet-empty">
            <CheckCircle2 :size="22" :stroke-width="1.7" />
            <strong>没有待结算视频</strong>
            <span>{{ pendingError || '余额足够时，视频完成后会自动结算。' }}</span>
          </div>
        </div>

        <div v-if="shouldShowPagination(pendingPage)" class="wallet-pagination">
          <button class="btn btn-sm" type="button" :disabled="!pendingPager.canPrevious" @click="goPendingPage(pendingPage.page - 1)">
            上一页
          </button>
          <span>{{ getWalletPaginationLabel(pendingPage) }}</span>
          <button class="btn btn-sm" type="button" :disabled="!pendingPager.canNext" @click="goPendingPage(pendingPage.page + 1)">
            下一页
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  CreditCard,
  ListChecks,
  Loader2,
  ReceiptText,
  Wallet,
  XCircle,
} from 'lucide-vue-next'
import {
  paymentAPI,
  videoAPI,
  walletAPI,
  type PaginatedResponse,
  type PaymentOrder,
  type PendingVideoSettlement,
  type WalletSummary,
  type WalletTransaction,
} from '@/composables/useApi'
import {
  describeTransaction,
  formatDateTime,
  formatMoney,
  formatTransactionAmount,
  getOrderStatusMeta,
  getPaymentOrderActions,
  getPendingSettlementMeta,
  getPendingSettlementSummary,
  getTransactionTone,
  getWalletPaginationLabel,
  getWalletPaginationState,
  hasPendingPaymentOrders,
  isPendingSettlementRetryable,
  normalizeRechargeAmountInput,
  upsertPaymentOrder,
  type WalletPaginationState,
} from './wallet-view-policy'
import '@/assets/wallet.css'

type PageState = Pick<WalletPaginationState, 'page' | 'pageSize' | 'total' | 'totalPages'>

const route = useRoute()
const quickAmounts = ['1.00', '10.00', '50.00', '100.00', '500.00']
const pageSize = 10
const defaultSummary: WalletSummary = {
  balance: '0.00',
  totalRecharged: '0.00',
  totalConsumed: '0.00',
  videoPricePerSecond: '1.00',
}

const summary = ref<WalletSummary>({ ...defaultSummary })
const orders = ref<PaymentOrder[]>([])
const transactions = ref<WalletTransaction[]>([])
const pendingSettlements = ref<PendingVideoSettlement[]>([])
const ordersPage = ref(createPageState())
const transactionsPage = ref(createPageState())
const pendingPage = ref(createPageState())
const rechargeAmount = ref('100.00')
const rechargeError = ref('')
const walletError = ref('')
const ordersError = ref('')
const transactionsError = ref('')
const pendingError = ref('')
const creatingOrder = ref(false)
const orderActionOrderNo = ref('')
const activeOrder = ref<PaymentOrder | null>(null)
let orderRefreshTimer: number | undefined
let settlementRefreshTimer: number | undefined

const ordersPager = computed(() => getWalletPaginationState(ordersPage.value))
const transactionsPager = computed(() => getWalletPaginationState(transactionsPage.value))
const pendingPager = computed(() => getWalletPaginationState(pendingPage.value))
const pendingSettlementTotal = computed(() => pendingPage.value.total || pendingSettlements.value.length)

function createPageState(): PageState {
  return {
    page: 1,
    pageSize,
    total: 0,
    totalPages: 1,
  }
}

function applyPageState<T>(target: Ref<PageState>, response: PaginatedResponse<T>) {
  target.value = {
    page: response.page || 1,
    pageSize: response.pageSize || pageSize,
    total: response.total || 0,
    totalPages: response.totalPages || 1,
  }
}

function shouldShowPagination(meta: PageState) {
  return getWalletPaginationState(meta).totalPages > 1
}

function readOrderNo(order: PaymentOrder) {
  return order.orderNo || order.order_no || '未生成订单号'
}

function readTransactionNo(transaction: WalletTransaction) {
  return transaction.transactionNo || transaction.transaction_no || `${transaction.type}-${transaction.createdAt || transaction.created_at}`
}

async function loadSummary() {
  walletError.value = ''
  try {
    summary.value = await walletAPI.get()
  } catch {
    walletError.value = '钱包接口暂未可用，后端接入后会自动显示余额。'
    summary.value = { ...defaultSummary }
  }
}

async function loadOrders(page = ordersPage.value.page) {
  ordersError.value = ''
  try {
    const response = await paymentAPI.listOrders({ page, pageSize: ordersPage.value.pageSize })
    orders.value = response.items || []
    applyPageState(ordersPage, response)
  } catch {
    orders.value = []
    ordersError.value = '订单列表接口暂未可用。'
  }
}

async function loadTransactions(page = transactionsPage.value.page) {
  transactionsError.value = ''
  try {
    const response = await walletAPI.transactions({ page, pageSize: transactionsPage.value.pageSize })
    transactions.value = response.items || []
    applyPageState(transactionsPage, response)
  } catch {
    transactions.value = []
    transactionsError.value = '流水接口暂未可用。'
  }
}

async function loadPendingSettlements(page = pendingPage.value.page) {
  pendingError.value = ''
  try {
    const response = await walletAPI.pendingSettlements({ page, pageSize: pendingPage.value.pageSize })
    pendingSettlements.value = response.items || []
    applyPageState(pendingPage, response)
  } catch {
    pendingSettlements.value = []
    pendingError.value = '待结算列表接口暂未可用。'
  }
}

async function refreshAll() {
  await Promise.all([
    loadSummary(),
    loadOrders(),
    loadTransactions(),
    loadPendingSettlements(),
  ])
}

async function refreshPendingPaymentOrders() {
  if (!hasPendingPaymentOrders(orders.value)) return
  await Promise.all([
    loadOrders(ordersPage.value.page),
    loadSummary(),
    loadTransactions(transactionsPage.value.page),
  ])
}

function startOrderRefresh() {
  if (typeof window === 'undefined' || orderRefreshTimer) return
  orderRefreshTimer = window.setInterval(() => {
    void refreshPendingPaymentOrders()
  }, 5000)
}

function stopOrderRefresh() {
  if (!orderRefreshTimer || typeof window === 'undefined') return
  window.clearInterval(orderRefreshTimer)
  orderRefreshTimer = undefined
}

async function refreshPendingSettlementSnapshot() {
  await Promise.all([
    loadPendingSettlements(pendingPage.value.page),
    loadSummary(),
    loadTransactions(transactionsPage.value.page),
  ])
}

function startSettlementRefresh() {
  if (typeof window === 'undefined' || settlementRefreshTimer) return
  settlementRefreshTimer = window.setInterval(() => {
    void refreshPendingSettlementSnapshot()
  }, 5000)
}

function stopSettlementRefresh() {
  if (!settlementRefreshTimer || typeof window === 'undefined') return
  window.clearInterval(settlementRefreshTimer)
  settlementRefreshTimer = undefined
}

function refreshWalletOnResume() {
  void refreshAll()
}

function handleVisibilityChange() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
    refreshWalletOnResume()
  }
}

function replaceOrderInList(updatedOrder: PaymentOrder) {
  orders.value = upsertPaymentOrder(orders.value, updatedOrder)
}

async function goOrdersPage(page: number) {
  if (page < 1 || page > ordersPage.value.totalPages) return
  await loadOrders(page)
}

async function goTransactionsPage(page: number) {
  if (page < 1 || page > transactionsPage.value.totalPages) return
  await loadTransactions(page)
}

async function goPendingPage(page: number) {
  if (page < 1 || page > pendingPage.value.totalPages) return
  await loadPendingSettlements(page)
}

function scrollToPendingList() {
  if (typeof document === 'undefined') return
  document.getElementById('wallet-pending')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function createRechargeOrder() {
  rechargeError.value = ''
  const normalizedAmount = normalizeRechargeAmountInput(rechargeAmount.value)
  if (!normalizedAmount) {
    rechargeError.value = '请输入 1 到 9999 元之间的充值金额。'
    return
  }

  creatingOrder.value = true
  try {
    rechargeAmount.value = normalizedAmount
    const order = await paymentAPI.createRechargeOrder(normalizedAmount)
    activeOrder.value = { orderNo: order.orderNo, amount: order.amount, status: 'pending' }
    const wasOnFirstOrderPage = ordersPage.value.page === 1
    const nextTotal = ordersPage.value.total + 1
    ordersPage.value = {
      ...ordersPage.value,
      page: 1,
      total: nextTotal,
      totalPages: Math.max(Math.ceil(nextTotal / ordersPage.value.pageSize), 1),
    }
    orders.value = upsertPaymentOrder(wasOnFirstOrderPage ? orders.value : [], {
      orderNo: order.orderNo,
      amount: order.amount,
      status: 'pending',
      provider: 'alipay',
      createdAt: new Date().toISOString(),
    })
    submitPaymentForm(order.paymentFormHtml)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '创建充值订单失败')
  } finally {
    creatingOrder.value = false
  }
}

async function continuePayment(order: PaymentOrder) {
  const orderNo = readOrderNo(order)
  orderActionOrderNo.value = orderNo
  try {
    const paymentOrder = await paymentAPI.continueOrder(orderNo)
    activeOrder.value = { orderNo: paymentOrder.orderNo, amount: paymentOrder.amount, status: 'pending' }
    submitPaymentForm(paymentOrder.paymentFormHtml)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '继续支付失败')
  } finally {
    orderActionOrderNo.value = ''
  }
}

async function cancelPayment(order: PaymentOrder) {
  const orderNo = readOrderNo(order)
  orderActionOrderNo.value = orderNo
  try {
    const updatedOrder = await paymentAPI.cancelOrder(orderNo)
    replaceOrderInList(updatedOrder)
    if (activeOrder.value && readOrderNo(activeOrder.value) === orderNo) {
      activeOrder.value = { ...activeOrder.value, status: 'closed' }
    }
    toast.success('已取消待支付订单')
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '取消支付失败')
  } finally {
    orderActionOrderNo.value = ''
  }
}

function submitPaymentForm(html: string) {
  const mount = document.createElement('div')
  mount.style.display = 'none'
  mount.innerHTML = html
  document.body.appendChild(mount)
  const form = mount.querySelector('form')
  if (!form) {
    document.body.removeChild(mount)
    toast.error('支付宝支付表单无效')
    return
  }
  form.submit()
}

async function pollOrder(orderNo: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 30000) {
    try {
      const order = await paymentAPI.getOrder(orderNo)
      activeOrder.value = order
      if (order.status === 'paid') {
        await refreshAll()
        toast.success('充值已到账')
        return
      }
      if (order.status === 'closed') {
        await loadOrders(ordersPage.value.page)
        return
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 3000))
  }
}

async function retrySettlement(videoGenerationId: number) {
  try {
    await videoAPI.retryBilling(videoGenerationId)
    toast.success('已重新发起结算')
    await refreshAll()
  } catch (error) {
    toast.error(error instanceof Error ? error.message : '重试结算失败')
  }
}

onMounted(async () => {
  await refreshAll()
  startOrderRefresh()
  startSettlementRefresh()
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', refreshWalletOnResume)
    window.addEventListener('pageshow', refreshWalletOnResume)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
  const orderNo = typeof route.query.orderNo === 'string' ? route.query.orderNo : ''
  if (orderNo) void pollOrder(orderNo)
})

onUnmounted(() => {
  stopOrderRefresh()
  stopSettlementRefresh()
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', refreshWalletOnResume)
    window.removeEventListener('pageshow', refreshWalletOnResume)
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
})
</script>
