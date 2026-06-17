<template>
  <div class="profile-page">
    <section class="profile-hero" aria-labelledby="profile-title">
      <div class="profile-account-card">
        <div class="profile-avatar">
          <UserCircle :size="32" :stroke-width="1.6" />
        </div>
        <div class="profile-account-copy">
          <span class="profile-kicker">个人主页</span>
          <h1 id="profile-title">{{ auth.state.user?.username || '创作者' }}</h1>
          <p>{{ auth.state.user?.phone || auth.state.user?.email || '当前登录账户' }}</p>
        </div>
        <button class="btn" type="button" @click="router.push('/settings')">
          <Settings2 :size="15" :stroke-width="1.9" />
          账户设置
        </button>
      </div>

      <div class="profile-wallet-card">
        <div>
          <span class="profile-kicker">可用余额</span>
          <div class="profile-balance">¥{{ summary.balance }}</div>
          <p>视频生成按实际确认秒数扣费。</p>
        </div>
        <button class="btn btn-primary" type="button" @click="router.push('/wallet')">
          <Wallet :size="15" :stroke-width="2" />
          充值
        </button>
      </div>
    </section>

    <section v-if="pendingSettlements.length" class="profile-alert">
      <CircleAlert :size="18" :stroke-width="1.8" />
      <div>
        <strong>{{ pendingSettlements.length }} 个视频等待结算</strong>
        <span>充值后可继续扣费并发布成品视频。</span>
      </div>
      <button class="btn btn-sm" type="button" @click="router.push('/wallet')">去处理</button>
    </section>

    <section class="profile-grid">
      <article class="profile-panel profile-panel--metrics">
        <div class="profile-section-head">
          <h2>创作概览</h2>
          <span>工作台汇总</span>
        </div>
        <div class="profile-metric-grid">
          <div>
            <b>{{ projectStats.total }}</b>
            <span>项目数</span>
          </div>
          <div>
            <b>{{ projectStats.running }}</b>
            <span>制作中</span>
          </div>
          <div>
            <b>¥{{ summary.totalConsumed }}</b>
            <span>累计消耗</span>
          </div>
          <div>
            <b>¥{{ summary.videoPricePerSecond }}/秒</b>
            <span>视频单价</span>
          </div>
        </div>
      </article>

      <article class="profile-panel">
        <div class="profile-section-head">
          <h2>快捷入口</h2>
          <span>常用操作</span>
        </div>
        <div class="profile-actions">
          <button type="button" @click="router.push('/wallet')">
            <Wallet :size="17" :stroke-width="1.9" />
            <span>充值与订单</span>
          </button>
          <button type="button" @click="router.push('/workspace')">
            <LayoutGrid :size="17" :stroke-width="1.9" />
            <span>项目工作台</span>
          </button>
          <button type="button" @click="router.push('/character-assets')">
            <Images :size="17" :stroke-width="1.9" />
            <span>形象库</span>
          </button>
        </div>
      </article>
    </section>

    <section class="profile-panel profile-activity">
      <div class="profile-section-head">
        <h2>最近资金动态</h2>
        <button class="btn btn-sm" type="button" @click="router.push('/wallet')">查看全部</button>
      </div>

      <div v-if="recentTransactions.length" class="profile-activity-list">
        <div v-for="item in recentTransactions" :key="readTransactionNo(item)" class="profile-activity-row">
          <span :class="['profile-activity-icon', getTransactionTone(item)]">
            <ArrowDownLeft v-if="getTransactionTone(item) === 'income'" :size="15" :stroke-width="1.9" />
            <ArrowUpRight v-else :size="15" :stroke-width="1.9" />
          </span>
          <div>
            <strong>{{ item.description || describeTransaction(item) }}</strong>
            <span>{{ formatDateTime(item.createdAt || item.created_at) }}</span>
          </div>
          <b :class="getTransactionTone(item)">¥{{ formatMoney(item.amount) }}</b>
        </div>
      </div>

      <div v-else class="profile-empty">
        <ReceiptText :size="22" :stroke-width="1.7" />
        <strong>暂无资金动态</strong>
        <span>{{ activityError || '充值到账和视频扣费会显示在这里。' }}</span>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleAlert,
  Images,
  LayoutGrid,
  ReceiptText,
  Settings2,
  UserCircle,
  Wallet,
} from 'lucide-vue-next'
import { dramaAPI, walletAPI, type WalletSummary, type WalletTransaction, type PendingVideoSettlement } from '@/composables/useApi'
import { useAuth } from '@/composables/useAuth'
import { getHomeProjectStats } from './home-workbench-policy'
import {
  describeTransaction,
  formatDateTime,
  formatMoney,
  getTransactionTone,
} from './wallet-view-policy'
import '@/assets/profile.css'

const router = useRouter()
const auth = useAuth()
const defaultSummary: WalletSummary = {
  balance: '0.00',
  totalRecharged: '0.00',
  totalConsumed: '0.00',
  videoPricePerSecond: '1.00',
}

const summary = ref<WalletSummary>({ ...defaultSummary })
const projects = ref<any[]>([])
const recentTransactions = ref<WalletTransaction[]>([])
const pendingSettlements = ref<PendingVideoSettlement[]>([])
const activityError = ref('')

const projectStats = computed(() => getHomeProjectStats(projects.value))

function readTransactionNo(transaction: WalletTransaction) {
  return transaction.transactionNo || transaction.transaction_no || `${transaction.type}-${transaction.createdAt || transaction.created_at}`
}

async function loadProfile() {
  const [walletResult, projectResult, transactionResult, pendingResult] = await Promise.allSettled([
    walletAPI.get(),
    dramaAPI.list(),
    walletAPI.transactions(5),
    walletAPI.pendingSettlements(),
  ])

  if (walletResult.status === 'fulfilled') summary.value = walletResult.value
  if (projectResult.status === 'fulfilled') projects.value = projectResult.value.items || []
  if (transactionResult.status === 'fulfilled') {
    recentTransactions.value = transactionResult.value.items || []
  } else {
    activityError.value = '钱包流水接口暂未可用。'
  }
  if (pendingResult.status === 'fulfilled') pendingSettlements.value = pendingResult.value.items || []
}

onMounted(() => {
  void loadProfile()
})
</script>
